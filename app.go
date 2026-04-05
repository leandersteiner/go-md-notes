package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

type Block struct {
	ID        string `json:"id"`
	Markdown  string `json:"markdown"`
	Sensitive bool   `json:"sensitive"`
}

type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"isDir"`
	Children []FileNode `json:"children,omitempty"`
}

type AppConfig struct {
	NotesDir string `json:"notesDir"`
}

type NoteDocument struct {
	Blocks        []Block `json:"blocks"`
	NoteSensitive bool    `json:"noteSensitive"`
}

type WorkspaceState struct {
	NotesDir   string     `json:"notesDir"`
	Tree       []FileNode `json:"tree"`
	DirtyPaths []string   `json:"dirtyPaths"`
}

var attrRegex = regexp.MustCompile(`([a-zA-Z]+)="([^"]*)"`)

const noteMetaPrefix = "<!-- go-md-notes:note"
const encryptedRegionPrefix = "<!-- go-md-notes:encrypted"
const encryptedRegionFooter = "<!-- /go-md-notes:encrypted -->"

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

func (a *App) InitWorkspace() (WorkspaceState, error) {
	cfg, err := loadConfig()
	if err != nil {
		return WorkspaceState{}, err
	}

	if !isExistingDir(cfg.NotesDir) {
		dir, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
			Title: "Select notes folder",
		})
		if err != nil {
			return WorkspaceState{}, err
		}
		if strings.TrimSpace(dir) == "" {
			return WorkspaceState{}, errors.New("notes folder not selected")
		}
		cfg.NotesDir = dir
		if err := saveConfig(cfg); err != nil {
			return WorkspaceState{}, err
		}
	}

	tree, err := buildFileTree(cfg.NotesDir)
	if err != nil {
		return WorkspaceState{}, err
	}
	dirtyPaths, err := gitDirtyPaths(cfg.NotesDir)
	if err != nil {
		return WorkspaceState{}, err
	}

	return WorkspaceState{
		NotesDir:   cfg.NotesDir,
		Tree:       tree,
		DirtyPaths: dirtyPaths,
	}, nil
}

func (a *App) ChooseNotesDir() (WorkspaceState, error) {
	dir, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select notes folder",
	})
	if err != nil {
		return WorkspaceState{}, err
	}
	if strings.TrimSpace(dir) == "" {
		return WorkspaceState{}, errors.New("notes folder not selected")
	}

	cfg := AppConfig{NotesDir: dir}
	if err := saveConfig(cfg); err != nil {
		return WorkspaceState{}, err
	}

	tree, err := buildFileTree(cfg.NotesDir)
	if err != nil {
		return WorkspaceState{}, err
	}
	dirtyPaths, err := gitDirtyPaths(cfg.NotesDir)
	if err != nil {
		return WorkspaceState{}, err
	}

	return WorkspaceState{
		NotesDir:   cfg.NotesDir,
		Tree:       tree,
		DirtyPaths: dirtyPaths,
	}, nil
}

func (a *App) RefreshWorkspace() (WorkspaceState, error) {
	cfg, err := loadConfig()
	if err != nil {
		return WorkspaceState{}, err
	}
	if !isExistingDir(cfg.NotesDir) {
		return WorkspaceState{}, errors.New("notes folder not configured")
	}

	tree, err := buildFileTree(cfg.NotesDir)
	if err != nil {
		return WorkspaceState{}, err
	}
	dirtyPaths, err := gitDirtyPaths(cfg.NotesDir)
	if err != nil {
		return WorkspaceState{}, err
	}
	return WorkspaceState{
		NotesDir:   cfg.NotesDir,
		Tree:       tree,
		DirtyPaths: dirtyPaths,
	}, nil
}

func (a *App) RenamePath(path string, newName string) (string, error) {
	if strings.TrimSpace(newName) == "" {
		return "", errors.New("new name is required")
	}
	if strings.Contains(newName, "/") || strings.Contains(newName, "\\") {
		return "", errors.New("new name must not contain path separators")
	}

	resolved, err := resolveWorkspacePath(path)
	if err != nil {
		return "", err
	}

	target := filepath.Join(filepath.Dir(resolved), newName)
	if err := ensurePathInsideNotesDir(target); err != nil {
		return "", err
	}
	if _, err := os.Stat(target); err == nil {
		return "", errors.New("target already exists")
	}

	if err := os.Rename(resolved, target); err != nil {
		return "", err
	}
	return target, nil
}

func (a *App) DeletePath(path string) error {
	resolved, err := resolveWorkspacePath(path)
	if err != nil {
		return err
	}
	return os.RemoveAll(resolved)
}

func (a *App) CreateFile(parentDir string, name string) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", errors.New("file name is required")
	}
	if strings.Contains(name, "/") || strings.Contains(name, "\\") {
		return "", errors.New("file name must not contain path separators")
	}

	parent, err := resolveWorkspacePath(parentDir)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(parent)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("parent path is not a directory")
	}

	target := filepath.Join(parent, name)
	if err := ensurePathInsideNotesDir(target); err != nil {
		return "", err
	}
	if _, err := os.Stat(target); err == nil {
		return "", errors.New("file already exists")
	}

	if err := os.WriteFile(target, []byte(""), 0o644); err != nil {
		return "", err
	}
	return target, nil
}

func (a *App) CreateFolder(parentDir string, name string) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", errors.New("folder name is required")
	}
	if strings.Contains(name, "/") || strings.Contains(name, "\\") {
		return "", errors.New("folder name must not contain path separators")
	}

	parent, err := resolveWorkspacePath(parentDir)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(parent)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("parent path is not a directory")
	}

	target := filepath.Join(parent, name)
	if err := ensurePathInsideNotesDir(target); err != nil {
		return "", err
	}
	if err := os.Mkdir(target, 0o755); err != nil {
		return "", err
	}
	return target, nil
}

func (a *App) SaveNote(path string, blocks []Block, password string, noteSensitive bool) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("path is required")
	}
	path = resolveNotePath(path)
	if len(blocks) == 0 {
		blocks = []Block{{ID: newBlockID(), Markdown: "", Sensitive: false}}
	}

	lines := make([]string, 0, len(blocks)+8)
	if noteSensitive {
		lines = append(lines, fmt.Sprintf(`%s sensitive="true" -->`, noteMetaPrefix))
	}

	for i := 0; i < len(blocks); {
		block := blocks[i]
		if block.ID == "" {
			block.ID = newBlockID()
		}
		if !noteSensitive && !block.Sensitive {
			lines = append(lines, block.Markdown)
			i++
			continue
		}

		start := i
		for i < len(blocks) && (noteSensitive || blocks[i].Sensitive) {
			i++
		}

		segmentLines := make([]string, 0, i-start)
		for _, sensitiveBlock := range blocks[start:i] {
			segmentLines = append(segmentLines, sensitiveBlock.Markdown)
		}
		segmentText := strings.Join(segmentLines, "\n")

		if password == "" {
			return fmt.Errorf("password required for sensitive block %s", block.ID)
		}
		encrypted, err := EncryptWithPassword([]byte(segmentText), password)
		if err != nil {
			return fmt.Errorf("encrypt block %s: %w", block.ID, err)
		}

		lines = append(lines,
			fmt.Sprintf(`%s salt="%s" nonce="%s" -->`, encryptedRegionPrefix, encrypted.SaltB64, encrypted.NonceB64),
			base64.StdEncoding.EncodeToString(encrypted.Ciphertext),
			encryptedRegionFooter,
		)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0o644)
}

func (a *App) LoadNote(path string, password string) (NoteDocument, error) {
	if strings.TrimSpace(path) == "" {
		return NoteDocument{}, errors.New("path is required")
	}
	path = resolveNotePath(path)

	data, err := os.ReadFile(path)
	if err != nil {
		return NoteDocument{}, err
	}

	content := string(data)

	lines := strings.Split(content, "\n")
	result := make([]Block, 0)
	noteSensitive := false
	for i := 0; i < len(lines); i++ {
		rawLine := lines[i]
		trimmedLine := strings.TrimSpace(rawLine)
		if strings.HasPrefix(trimmedLine, noteMetaPrefix) {
			attrs := parseAttrs(trimmedLine)
			noteSensitive = attrs["sensitive"] == "true"
			continue
		}
		if strings.HasPrefix(trimmedLine, encryptedRegionPrefix) {
			attrs := parseAttrs(trimmedLine)
			var bodyLines []string
			i++
			for ; i < len(lines); i++ {
				if strings.TrimSpace(lines[i]) == encryptedRegionFooter {
					break
				}
				bodyLines = append(bodyLines, lines[i])
			}
			body := strings.Join(bodyLines, "")

			appendRawEncryptedRegion := func() {
				result = append(result, Block{
					ID:        newBlockID(),
					Markdown:  rawLine,
					Sensitive: false,
				})
				for _, bodyLine := range bodyLines {
					result = append(result, Block{
						ID:        newBlockID(),
						Markdown:  bodyLine,
						Sensitive: false,
					})
				}
				result = append(result, Block{
					ID:        newBlockID(),
					Markdown:  encryptedRegionFooter,
					Sensitive: false,
				})
			}

			if strings.TrimSpace(password) == "" {
				appendRawEncryptedRegion()
				continue
			}

			encryptedBody := strings.TrimSpace(body)
			ciphertext, err := base64.StdEncoding.DecodeString(encryptedBody)
			if err != nil {
				appendRawEncryptedRegion()
				continue
			}
			plaintext, err := DecryptWithPassword(EncryptedBlock{
				SaltB64:    attrs["salt"],
				NonceB64:   attrs["nonce"],
				Ciphertext: ciphertext,
			}, password)
			if err != nil {
				appendRawEncryptedRegion()
				continue
			}
			result = append(result, splitLinesToBlocks(string(plaintext), true)...)
			continue
		}

		result = append(result, Block{
			ID:        newBlockID(),
			Markdown:  rawLine,
			Sensitive: false,
		})
	}

	if len(result) == 0 {
		return NoteDocument{
			Blocks:        []Block{{ID: newBlockID(), Markdown: content, Sensitive: false}},
			NoteSensitive: false,
		}, nil
	}

	return NoteDocument{
		Blocks:        result,
		NoteSensitive: noteSensitive,
	}, nil
}

func splitLinesToBlocks(text string, sensitive bool) []Block {
	lines := strings.Split(text, "\n")
	blocks := make([]Block, 0, len(lines))
	for _, line := range lines {
		blocks = append(blocks, Block{
			ID:        newBlockID(),
			Markdown:  line,
			Sensitive: sensitive,
		})
	}
	return blocks
}

func parseAttrs(line string) map[string]string {
	matches := attrRegex.FindAllStringSubmatch(line, -1)
	attrs := make(map[string]string, len(matches))
	for _, match := range matches {
		if len(match) == 3 {
			attrs[match[1]] = match[2]
		}
	}
	return attrs
}

func buildFileTree(root string) ([]FileNode, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}

	nodes := make([]FileNode, 0, len(entries))
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		fullPath := filepath.Join(root, entry.Name())
		if entry.IsDir() {
			children, err := buildFileTree(fullPath)
			if err != nil {
				return nil, err
			}
			nodes = append(nodes, FileNode{
				Name:     entry.Name(),
				Path:     fullPath,
				IsDir:    true,
				Children: children,
			})
			continue
		}
		nodes = append(nodes, FileNode{
			Name:  entry.Name(),
			Path:  fullPath,
			IsDir: false,
		})
	}

	slices.SortFunc(nodes, func(a, b FileNode) int {
		if a.IsDir != b.IsDir {
			if a.IsDir {
				return -1
			}
			return 1
		}
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	return nodes, nil
}

func configFilePath() (string, error) {
	if runtime.GOOS == "windows" {
		base, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(base, "go-md-notes", "config.json"), nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".go-md-notes", "config.json"), nil
}

func loadConfig() (AppConfig, error) {
	configPath, err := configFilePath()
	if err != nil {
		return AppConfig{}, err
	}
	data, err := os.ReadFile(configPath)
	if errors.Is(err, os.ErrNotExist) {
		return AppConfig{}, nil
	}
	if err != nil {
		return AppConfig{}, err
	}

	var cfg AppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return AppConfig{}, err
	}
	return cfg, nil
}

func saveConfig(cfg AppConfig) error {
	configPath, err := configFilePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0o644)
}

func resolveNotePath(path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	cfg, err := loadConfig()
	if err != nil || cfg.NotesDir == "" {
		return path
	}
	return filepath.Join(cfg.NotesDir, path)
}

func resolveWorkspacePath(path string) (string, error) {
	resolved := resolveNotePath(path)
	return resolved, ensurePathInsideNotesDir(resolved)
}

func ensurePathInsideNotesDir(target string) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	if cfg.NotesDir == "" {
		return errors.New("notes directory is not configured")
	}

	base := filepath.Clean(cfg.NotesDir)
	target = filepath.Clean(target)

	rel, err := filepath.Rel(base, target)
	if err != nil {
		return err
	}
	if rel == "." {
		return nil
	}
	if strings.HasPrefix(rel, "..") {
		return errors.New("path is outside notes directory")
	}
	return nil
}

func isExistingDir(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func gitDirtyPaths(root string) ([]string, error) {
	cmdCheck := exec.Command("git", "-C", root, "rev-parse", "--is-inside-work-tree")
	if err := cmdCheck.Run(); err != nil {
		return []string{}, nil
	}

	cmd := exec.Command("git", "-C", root, "status", "--porcelain", "-z", "--untracked-files=all")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return []string{}, nil
	}

	dirtySet := map[string]struct{}{}
	entries := strings.Split(string(out), "\x00")
	for i := 0; i < len(entries); i++ {
		entry := entries[i]
		if entry == "" || len(entry) < 4 {
			continue
		}
		status := entry[:2]
		pathPart := entry[3:]
		if status[0] == 'R' || status[0] == 'C' || status[1] == 'R' || status[1] == 'C' {
			if i+1 < len(entries) && entries[i+1] != "" {
				pathPart = entries[i+1]
				i++
			}
		}
		abs := filepath.Clean(filepath.Join(root, filepath.FromSlash(pathPart)))
		dirtySet[abs] = struct{}{}
	}

	paths := make([]string, 0, len(dirtySet))
	for p := range dirtySet {
		paths = append(paths, p)
	}
	slices.Sort(paths)
	return paths, nil
}
