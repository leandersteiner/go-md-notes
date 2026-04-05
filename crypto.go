package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"

	"golang.org/x/crypto/argon2"
)

type EncryptedBlock struct {
	SaltB64    string
	NonceB64   string
	Ciphertext []byte
}

func Encrypt(plaintext []byte, key []byte) (ciphertext []byte, nonce []byte, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, err
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}
	nonce = make([]byte, aesgcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, nil, err
	}

	ciphertext = aesgcm.Seal(nil, nonce, plaintext, nil)
	return ciphertext, nonce, nil
}

func Key(password string, salt string) []byte {
	return argon2.IDKey(
		[]byte(password),
		[]byte(salt),
		1,
		64*1024,
		4,
		32,
	)
}

func Decrypt(ciphertext []byte, key []byte, nonce []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}
	return plaintext, nil
}

func EncryptWithPassword(plaintext []byte, password string) (EncryptedBlock, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return EncryptedBlock{}, err
	}

	key := Key(password, base64.StdEncoding.EncodeToString(salt))
	ciphertext, nonce, err := Encrypt(plaintext, key)
	if err != nil {
		return EncryptedBlock{}, err
	}

	return EncryptedBlock{
		SaltB64:    base64.StdEncoding.EncodeToString(salt),
		NonceB64:   base64.StdEncoding.EncodeToString(nonce),
		Ciphertext: ciphertext,
	}, nil
}

func DecryptWithPassword(block EncryptedBlock, password string) ([]byte, error) {
	if block.SaltB64 == "" || block.NonceB64 == "" {
		return nil, errors.New("missing salt or nonce")
	}

	salt, err := base64.StdEncoding.DecodeString(block.SaltB64)
	if err != nil {
		return nil, err
	}
	nonce, err := base64.StdEncoding.DecodeString(block.NonceB64)
	if err != nil {
		return nil, err
	}

	key := Key(password, base64.StdEncoding.EncodeToString(salt))
	return Decrypt(block.Ciphertext, key, nonce)
}

func newBlockID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "block-fallback"
	}
	return "block-" + hex.EncodeToString(buf)
}
