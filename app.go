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

var attrRegex = regexp.MustCompile(`([a-zA-Z]+)="([^"]*)"`)

const blockHeaderPrefix = "<!-- go-md-notes:block"
const blockFooter = "<!-- /go-md-notes:block -->"

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

func (a *App) SaveNote(path string, blocks []Block, password string) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("path is required")
	}
	if len(blocks) == 0 {
		blocks = []Block{{ID: newBlockID(), Markdown: "", Sensitive: false}}
	}

	var out strings.Builder
	for _, block := range blocks {
		if block.ID == "" {
			block.ID = newBlockID()
		}

		header := fmt.Sprintf(`%s id="%s" sensitive="%t" encrypted="%t"`, blockHeaderPrefix, block.ID, block.Sensitive, block.Sensitive)
		body := block.Markdown

		if block.Sensitive {
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

func (a *App) LoadNote(path string, password string) ([]Block, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("path is required")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	content := string(data)
	if !strings.Contains(content, blockHeaderPrefix) {
		return []Block{{ID: newBlockID(), Markdown: content, Sensitive: false}}, nil
	}

	lines := strings.Split(content, "\n")
	result := make([]Block, 0)
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
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
				return nil, fmt.Errorf("password required for sensitive block %s", block.ID)
			}
			encryptedBody := strings.TrimSpace(body)
			ciphertext, err := base64.StdEncoding.DecodeString(encryptedBody)
			if err != nil {
				return nil, fmt.Errorf("decode encrypted block %s: %w", block.ID, err)
			}
			plaintext, err := DecryptWithPassword(EncryptedBlock{
				SaltB64:    attrs["salt"],
				NonceB64:   attrs["nonce"],
				Ciphertext: ciphertext,
			}, password)
			if err != nil {
				return nil, fmt.Errorf("decrypt block %s: %w", block.ID, err)
			}
			block.Markdown = string(plaintext)
		} else {
			block.Markdown = body
		}

		result = append(result, block)
	}

	if len(result) == 0 {
		return []Block{{ID: newBlockID(), Markdown: content, Sensitive: false}}, nil
	}

	return result, nil
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
