package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
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

type NoteDocument struct {
	Blocks        []Block `json:"blocks"`
	NoteSensitive bool    `json:"noteSensitive"`
}

var attrRegex = regexp.MustCompile(`([a-zA-Z]+)="([^"]*)"`)

const blockHeaderPrefix = "<!-- go-md-notes:block"
const blockFooter = "<!-- /go-md-notes:block -->"
const metaPrefix = "<!-- go-md-notes:meta"

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

func (a *App) SaveNote(path string, blocks []Block, password string, noteSensitive bool) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("path is required")
	}
	if len(blocks) == 0 {
		blocks = []Block{{ID: newBlockID(), Markdown: "", Sensitive: false}}
	}

	var out strings.Builder
	out.WriteString(fmt.Sprintf(`%s note_sensitive="%t" -->`, metaPrefix, noteSensitive))
	out.WriteString("\n\n")
	for _, block := range blocks {
		if block.ID == "" {
			block.ID = newBlockID()
		}

		blockSensitive := noteSensitive || block.Sensitive
		header := fmt.Sprintf(`%s id="%s" sensitive="%t" encrypted="%t"`, blockHeaderPrefix, block.ID, block.Sensitive, blockSensitive)
		body := block.Markdown

		if blockSensitive {
			if password == "" {
				return fmt.Errorf("password required for sensitive block %s", block.ID)
			}
			encrypted, err := EncryptWithPassword([]byte(block.Markdown), password)
			if err != nil {
				return fmt.Errorf("encrypt block %s: %w", block.ID, err)
			}
			header = fmt.Sprintf(`%s salt="%s" nonce="%s"`, header, encrypted.SaltB64, encrypted.NonceB64)
			body = base64.StdEncoding.EncodeToString(encrypted.Ciphertext)
		}

		out.WriteString(header)
		out.WriteString(" -->\n")
		out.WriteString(body)
		out.WriteString("\n")
		out.WriteString(blockFooter)
		out.WriteString("\n\n")
	}

	return os.WriteFile(path, []byte(out.String()), 0o644)
}

func (a *App) LoadNote(path string, password string) (NoteDocument, error) {
	if strings.TrimSpace(path) == "" {
		return NoteDocument{}, errors.New("path is required")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return NoteDocument{}, err
	}

	content := string(data)
	if !strings.Contains(content, blockHeaderPrefix) {
		lines := strings.Split(content, "\n")
		blocks := make([]Block, 0, len(lines))
		for _, line := range lines {
			blocks = append(blocks, Block{
				ID:        newBlockID(),
				Markdown:  line,
				Sensitive: false,
			})
		}
		if len(blocks) == 0 {
			blocks = append(blocks, Block{ID: newBlockID(), Markdown: "", Sensitive: false})
		}
		return NoteDocument{Blocks: blocks, NoteSensitive: false}, nil
	}

	lines := strings.Split(content, "\n")
	result := make([]Block, 0)
	noteSensitive := false
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if strings.HasPrefix(line, metaPrefix) {
			attrs := parseAttrs(line)
			noteSensitive = attrs["note_sensitive"] == "true"
			continue
		}
		if !strings.HasPrefix(line, blockHeaderPrefix) {
			continue
		}

		attrs := parseAttrs(line)
		block := Block{
			ID:        attrs["id"],
			Sensitive: attrs["sensitive"] == "true",
		}
		if block.ID == "" {
			block.ID = newBlockID()
		}

		var bodyLines []string
		i++
		for ; i < len(lines); i++ {
			if strings.TrimSpace(lines[i]) == blockFooter {
				break
			}
			bodyLines = append(bodyLines, lines[i])
		}

		body := strings.Join(bodyLines, "\n")
		if attrs["encrypted"] == "true" {
			if password == "" {
				return NoteDocument{}, fmt.Errorf("password required for sensitive block %s", block.ID)
			}
			encryptedBody := strings.TrimSpace(body)
			ciphertext, err := base64.StdEncoding.DecodeString(encryptedBody)
			if err != nil {
				return NoteDocument{}, fmt.Errorf("decode encrypted block %s: %w", block.ID, err)
			}
			plaintext, err := DecryptWithPassword(EncryptedBlock{
				SaltB64:    attrs["salt"],
				NonceB64:   attrs["nonce"],
				Ciphertext: ciphertext,
			}, password)
			if err != nil {
				return NoteDocument{}, fmt.Errorf("decrypt block %s: %w", block.ID, err)
			}
			block.Markdown = string(plaintext)
		} else {
			block.Markdown = body
		}

		result = append(result, block)
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
