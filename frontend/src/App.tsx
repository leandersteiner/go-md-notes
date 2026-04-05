import {useEffect, useRef, useState} from 'react';
import './App.css';
import {Block} from "./types/Block";
import {
    ChooseNotesDir,
    CreateFile,
    CreateFolder,
    DeletePath,
    ExportRecoveryKey,
    ImportRecoveryKey,
    InitWorkspace,
    LoadNote,
    ReencryptNotes,
    RefreshWorkspace,
    RenamePath,
    SetupGeneratedKey,
    SetupManualPassphrase,
    SaveNote
} from "../wailsjs/go/main/App";
import CodeMirror from "@uiw/react-codemirror";
import {markdown} from "@codemirror/lang-markdown";
import {RangeSetBuilder} from "@codemirror/state";
import {Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, ViewPlugin} from "@codemirror/view";
import {languages} from "@codemirror/language-data";
import type {ViewUpdate} from "@codemirror/view";

type FileNode = {
    name: string;
    path: string;
    isDir: boolean;
    children?: FileNode[];
}

type WorkspaceState = {
    notesDir: string;
    tree: FileNode[];
    dirtyPaths?: string[];
    securityMode: string;
    securityConfigured: boolean;
}

type ContextMenuState = {
    visible: boolean;
    x: number;
    y: number;
    path: string;
    isDir: boolean;
}

type EditorContextMenuState = {
    visible: boolean;
    x: number;
    y: number;
}

type InputDialogState = {
    visible: boolean;
    mode: "createFile" | "createFolder" | "rename";
    path: string;
    value: string;
    title: string;
    confirmLabel: string;
}

type ConfirmDialogState = {
    visible: boolean;
    path: string;
    isDir: boolean;
    message: string;
}

function App() {
    const [notesDir, setNotesDir] = useState("");
    const [tree, setTree] = useState<FileNode[]>([]);
    const [activeFilePath, setActiveFilePath] = useState("");
    const [securityMode, setSecurityMode] = useState("unset");
    const [showSecuritySetup, setShowSecuritySetup] = useState(false);
    const [showSecuritySettings, setShowSecuritySettings] = useState(false);
    const [password, setPassword] = useState("");
    const [recoveryKey, setRecoveryKey] = useState("");
    const [importRecoveryKey, setImportRecoveryKey] = useState("");
    const [migrationOldPass, setMigrationOldPass] = useState("");
    const [migrationNewPass, setMigrationNewPass] = useState("");
    const [noteSensitive, setNoteSensitive] = useState(false);
    const [status, setStatus] = useState("Ready");
    const [editorText, setEditorText] = useState("# New note");
    const [loadedText, setLoadedText] = useState("# New note");
    const [loadedNoteSensitive, setLoadedNoteSensitive] = useState(false);
    const [gitDirtyPaths, setGitDirtyPaths] = useState<Record<string, boolean>>({});
    const [loadingFile, setLoadingFile] = useState(false);
    const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        path: "",
        isDir: false,
    });
    const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
    });
    const selectionRef = useRef({from: 0, to: 0});
    const [inputDialog, setInputDialog] = useState<InputDialogState>({
        visible: false,
        mode: "createFile",
        path: "",
        value: "",
        title: "",
        confirmLabel: "",
    });
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
        visible: false,
        path: "",
        isDir: false,
        message: "",
    });
    const hasUnsavedChanges = !!activeFilePath && (
        editorText !== loadedText || noteSensitive !== loadedNoteSensitive
    );

    useEffect(() => {
        const bootstrap = async () => {
            try {
                const workspace = await InitWorkspace();
                applyWorkspace(workspace);
                setShowSecuritySetup(!workspace.securityConfigured);
                setStatus("Workspace ready");
            } catch (e) {
                setStatus(`Workspace setup failed: ${String(e)}`);
            }
        };
        void bootstrap();
    }, []);

    useEffect(() => {
        const disableDefaultContextMenu = (event: MouseEvent) => {
            event.preventDefault();
        };
        const closeContextMenu = () => {
            setContextMenu((prev) => ({...prev, visible: false}));
            setEditorContextMenu((prev) => ({...prev, visible: false}));
        };

        document.addEventListener("contextmenu", disableDefaultContextMenu);
        document.addEventListener("click", closeContextMenu);

        return () => {
            document.removeEventListener("contextmenu", disableDefaultContextMenu);
            document.removeEventListener("click", closeContextMenu);
        };
    }, []);

    const setupGenerated = async () => {
        try {
            const workspace = await SetupGeneratedKey();
            applyWorkspace(workspace);
            setShowSecuritySetup(false);
            setStatus("Generated key saved to system keychain");
        } catch (e) {
            setStatus(`Key setup failed: ${String(e)}`);
        }
    };

    const setupManual = async () => {
        try {
            const workspace = await SetupManualPassphrase();
            applyWorkspace(workspace);
            setShowSecuritySetup(false);
            setStatus("Manual passphrase mode enabled");
        } catch (e) {
            setStatus(`Setup failed: ${String(e)}`);
        }
    };

    const exportRecoveryKey = async () => {
        try {
            const key = await ExportRecoveryKey();
            setRecoveryKey(key);
            setStatus("Recovery key exported");
        } catch (e) {
            setStatus(`Export failed: ${String(e)}`);
        }
    };

    const importRecovery = async () => {
        try {
            const workspace = await ImportRecoveryKey(importRecoveryKey);
            applyWorkspace(workspace);
            setImportRecoveryKey("");
            setStatus("Recovery key imported and generated mode enabled");
        } catch (e) {
            setStatus(`Import failed: ${String(e)}`);
        }
    };

    const reencryptAllNotes = async () => {
        try {
            const result = await ReencryptNotes(migrationOldPass, migrationNewPass);
            setMigrationOldPass("");
            setMigrationNewPass("");
            setStatus(`Re-encrypted ${result.updatedRegions} regions in ${result.updatedFiles} files`);
            await reloadTree();
        } catch (e) {
            setStatus(`Re-encryption failed: ${String(e)}`);
        }
    };

    const reloadTree = async () => {
        try {
            const workspace = await RefreshWorkspace();
            applyWorkspace(workspace);
            setStatus("Tree refreshed");
        } catch (e) {
            setStatus(`Refresh failed: ${String(e)}`);
        }
    };

    const chooseFolder = async () => {
        try {
            const workspace = await ChooseNotesDir();
            applyWorkspace(workspace);
            setExpandedDirs({});
            setActiveFilePath("");
            setEditorText("# New note");
            setLoadedText("# New note");
            setLoadedNoteSensitive(false);
            setStatus("Notes folder updated");
        } catch (e) {
            setStatus(`Select folder failed: ${String(e)}`);
        }
    };

    const loadFile = async (absolutePath: string) => {
        try {
            setLoadingFile(true);
            const doc = await LoadNote(absolutePath, password);
            const rebuilt = buildEditorLines(doc.blocks, doc.noteSensitive);
            const rebuiltText = rebuilt.join("\n");
            setEditorText(rebuiltText);
            setNoteSensitive(doc.noteSensitive);
            setLoadedText(rebuiltText);
            setLoadedNoteSensitive(doc.noteSensitive);
            setActiveFilePath(absolutePath);
            setStatus(`Loaded ${toDisplayPath(absolutePath, notesDir)}`);
        } catch (e) {
            setStatus(`Load failed: ${String(e)}`);
        } finally {
            setLoadingFile(false);
        }
    };

    const save = async () => {
        if (!activeFilePath) {
            setStatus("Select a file in the sidebar first");
            return;
        }
        try {
            const lines = editorText.split("\n");
            const prepared = parseSensitiveBlocksFromLines(lines, noteSensitive);
            await SaveNote(activeFilePath, prepared, password, noteSensitive);
            setLoadedText(editorText);
            setLoadedNoteSensitive(noteSensitive);
            setStatus(`Saved ${toDisplayPath(activeFilePath, notesDir)}`);
            await reloadTree();
        } catch (e) {
            setStatus(`Save failed: ${String(e)}`);
        }
    };

    const createFile = async (parentDir: string, name: string) => {
        try {
            const created = await CreateFile(parentDir, name.trim());
            await reloadTree();
            setActiveFilePath(created);
            setEditorText("");
            setLoadedText("");
            setLoadedNoteSensitive(false);
            setNoteSensitive(false);
            setStatus(`Created ${toDisplayPath(created, notesDir)}`);
        } catch (e) {
            setStatus(`Create file failed: ${String(e)}`);
        }
    };

    const createFolder = async (parentDir: string, name: string) => {
        try {
            await CreateFolder(parentDir, name.trim());
            await reloadTree();
            setStatus("Folder created");
        } catch (e) {
            setStatus(`Create folder failed: ${String(e)}`);
        }
    };

    const renamePath = async (path: string, name: string) => {
        try {
            const renamed = await RenamePath(path, name.trim());
            if (activeFilePath === path) {
                setActiveFilePath(renamed);
            }
            await reloadTree();
            setStatus("Renamed");
        } catch (e) {
            setStatus(`Rename failed: ${String(e)}`);
        }
    };

    const deletePath = async (path: string, _isDir: boolean) => {
        try {
            await DeletePath(path);
            if (activeFilePath === path) {
                setActiveFilePath("");
                setEditorText("# New note");
                setLoadedText("# New note");
                setLoadedNoteSensitive(false);
                setNoteSensitive(false);
            }
            await reloadTree();
            setStatus("Deleted");
        } catch (e) {
            setStatus(`Delete failed: ${String(e)}`);
        }
    };

    const submitInputDialog = async () => {
        const value = inputDialog.value.trim();
        if (!value) return;
        const dialog = inputDialog;
        setInputDialog((prev) => ({...prev, visible: false}));

        if (dialog.mode === "createFile") {
            await createFile(dialog.path, value);
            return;
        }
        if (dialog.mode === "createFolder") {
            await createFolder(dialog.path, value);
            return;
        }
        await renamePath(dialog.path, value);
    };

    const submitConfirmDialog = async () => {
        const dialog = confirmDialog;
        setConfirmDialog((prev) => ({...prev, visible: false}));
        await deletePath(dialog.path, dialog.isDir);
    };

    const toggleSensitive = () => {
        const from = selectionRef.current.from;
        const to = selectionRef.current.to;
        const hasSelection = to > from;

        if (hasSelection) {
            const existingRegion = findSensitiveRegionAroundSelection(editorText, from, to);
            if (existingRegion) {
                const next = removeSensitiveRegionMarkers(editorText, existingRegion.startLine, existingRegion.endLine);
                setEditorText(next);
                setEditorContextMenu((prev) => ({...prev, visible: false}));
                return;
            }
        }

        const selected = hasSelection ? editorText.slice(from, to) : "";
        const needsLeadingNewline = from > 0 && editorText[from - 1] !== "\n";
        const needsTrailingNewline = to < editorText.length && editorText[to] !== "\n";
        const prefix = needsLeadingNewline ? "\n" : "";
        const suffix = needsTrailingNewline ? "\n" : "";
        const body = hasSelection ? selected : "";
        const replacement = `${prefix}${MARKER_START}\n${body}\n${MARKER_END}${suffix}`;

        const next = editorText.slice(0, from) + replacement + editorText.slice(to);
        setEditorText(next);
        setEditorContextMenu((prev) => ({...prev, visible: false}));
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const mod = event.metaKey || event.ctrlKey;
            if (!mod) return;

            const key = event.key.toLowerCase();
            if (key === "s") {
                event.preventDefault();
                void save();
                return;
            }
            if (event.shiftKey && key === "o") {
                event.preventDefault();
                void chooseFolder();
                return;
            }
            if (event.shiftKey && key === "r") {
                event.preventDefault();
                void reloadTree();
                return;
            }
            if (event.shiftKey && key === "p") {
                event.preventDefault();
                setNoteSensitive((v) => !v);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    return (
        <div id="App" className="app-shell">
            <header className="toolbar">
                {securityMode === "manual" ? (
                    <input
                        className="toolbar-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && activeFilePath) {
                                event.preventDefault();
                                void loadFile(activeFilePath);
                            }
                        }}
                        type="password"
                        placeholder="Passphrase (manual mode)"
                    />
                ) : securityMode === "generated" ? (
                    <span className="security-indicator">Keychain mode</span>
                ) : (
                    <span className="security-indicator">Security mode not set</span>
                )}
                <button className="toolbar-btn" onClick={chooseFolder}>Choose Folder</button>
                <button className="toolbar-btn" onClick={reloadTree}>Refresh Tree</button>
                <button className="toolbar-btn" onClick={save} disabled={!activeFilePath}>Save</button>
                <button className="toolbar-btn" onClick={() => setShowSecuritySettings(true)}>Security</button>
                <button className="toolbar-btn" onClick={() => setNoteSensitive((v) => !v)}>
                    {noteSensitive ? "Full Note: Sensitive" : "Full Note: Public"}
                </button>
                <span className="status">{status}</span>
            </header>
            <main className="editor-container">
                <aside className="sidebar">
                    <div className="sidebar-title">{notesDir || "No notes folder selected"}</div>
                    <div
                        className="file-tree"
                        onMouseDownCapture={(event) => {
                            if (event.button === 2) {
                                event.preventDefault();
                            }
                        }}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            if (!notesDir) return;
                            setContextMenu({
                                visible: true,
                                x: event.clientX,
                                y: event.clientY,
                                path: notesDir,
                                isDir: true,
                            });
                        }}
                    >
                        {tree.length === 0 ? (
                            <div className="tree-empty">No files</div>
                        ) : (
                            <TreeNodes
                                nodes={tree}
                                depth={0}
                                selectedFile={activeFilePath}
                                hasUnsavedChanges={hasUnsavedChanges}
                                gitDirtyPaths={gitDirtyPaths}
                                expandedDirs={expandedDirs}
                                onToggleDir={(dirPath) =>
                                    setExpandedDirs((prev) => ({...prev, [dirPath]: !prev[dirPath]}))
                                }
                                onContextMenu={(event, path, isDir) => {
                                    setContextMenu({
                                        visible: true,
                                        x: event.clientX,
                                        y: event.clientY,
                                        path,
                                        isDir,
                                    });
                                }}
                                onSelectFile={loadFile}
                            />
                        )}
                    </div>
                </aside>
                <section className="editor-pane">
                    <div className="editor-path">
                        {activeFilePath ? toDisplayPath(activeFilePath, notesDir) : "Select a file to edit"}
                        {hasUnsavedChanges ? <span className="path-badge unsaved">Unsaved</span> : null}
                        {activeFilePath && gitDirtyPaths[activeFilePath] ? (
                            <span className="path-badge git">Uncommitted</span>
                        ) : null}
                    </div>
                    {activeFilePath ? (
                        <div
                            className="editor-context-layer"
                            onMouseDownCapture={(event) => {
                                if (event.button === 2) {
                                    event.preventDefault();
                                }
                            }}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setEditorContextMenu({
                                    visible: true,
                                    x: event.clientX,
                                    y: event.clientY,
                                });
                            }}
                        >
                            <CodeMirror
                                value={editorText}
                                editable={!loadingFile}
                                onChange={(value) => setEditorText(value)}
                                onUpdate={(update: ViewUpdate) => {
                                    const sel = update.state.selection.main;
                                    selectionRef.current = {from: sel.from, to: sel.to};
                                }}
                                extensions={[
                                markdown({
                                    codeLanguages: languages,
                                }),
                                atxHeadingLineDecorations,
                                fencedCodeLineDecorations,
                                inlineCodeDecorations,
                                EditorView.lineWrapping,
                                highlightActiveLine(),
                                highlightActiveLineGutter(),
                                keymap.of([
                                    {key: "Mod-s", run: () => { void save(); return true; }},
                                    {key: "Mod-Shift-o", run: () => { void chooseFolder(); return true; }},
                                    {key: "Mod-Shift-r", run: () => { void reloadTree(); return true; }},
                                    {key: "Mod-Shift-p", run: () => { setNoteSensitive((v) => !v); return true; }},
                                ]),
                                EditorView.theme({
                                    "&": {
                                        height: "100%",
                                        fontSize: "16px",
                                        backgroundColor: "#0f1720",
                                        color: "#e6eef7",
                                    },
                                    ".cm-scroller": {
                                        overflow: "auto",
                                        fontFamily: "\"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, monospace",
                                    },
                                    ".cm-content": {
                                        padding: "1rem",
                                        caretColor: "#f2f7ff",
                                    },
                                    ".cm-line": {
                                        color: "#e2ebf5",
                                    },
                                    ".cm-line.cm-atx-h1": {
                                        fontSize: "2em",
                                        fontWeight: "700",
                                        color: "#f5fbff",
                                    },
                                    ".cm-line.cm-atx-h2": {
                                        fontSize: "1.7em",
                                        fontWeight: "700",
                                        color: "#eef8ff",
                                    },
                                    ".cm-line.cm-atx-h3": {
                                        fontSize: "1.45em",
                                        fontWeight: "700",
                                        color: "#e7f4ff",
                                    },
                                    ".cm-line.cm-atx-h4": {
                                        fontSize: "1.25em",
                                        fontWeight: "700",
                                        color: "#ddecfb",
                                    },
                                    ".cm-line.cm-atx-h5": {
                                        fontSize: "1.1em",
                                        fontWeight: "700",
                                        color: "#d2e3f3",
                                    },
                                    ".cm-line.cm-atx-h6": {
                                        fontSize: "1em",
                                        fontWeight: "700",
                                        color: "#c6d8e8",
                                    },
                                    ".cm-line.cm-codeblock-start, .cm-line.cm-codeblock-mid, .cm-line.cm-codeblock-end": {
                                        backgroundColor: "#111c27",
                                        borderLeft: "1px solid #243848",
                                        borderRight: "1px solid #243848",
                                    },
                                    ".cm-line.cm-codeblock-start": {
                                        borderTop: "1px solid #243848",
                                        borderTopLeftRadius: "6px",
                                        borderTopRightRadius: "6px",
                                        marginTop: "0.2rem",
                                    },
                                    ".cm-line.cm-codeblock-end": {
                                        borderBottom: "1px solid #243848",
                                        borderBottomLeftRadius: "6px",
                                        borderBottomRightRadius: "6px",
                                        marginBottom: "0.2rem",
                                    },
                                    ".cm-inline-code-pill": {
                                        backgroundColor: "#182532",
                                        border: "1px solid #2a4255",
                                        borderRadius: "4px",
                                        padding: "0 0.2em",
                                        color: "#d8e8f7",
                                    },
                                    ".cm-cursor, .cm-dropCursor": {
                                        borderLeftColor: "#f3f8ff",
                                        borderLeftWidth: "2px",
                                    },
                                    ".cm-selectionBackground, ::selection": {
                                        backgroundColor: "#335a7a !important",
                                    },
                                    ".cm-activeLine": {
                                        backgroundColor: "#1a2a39",
                                    },
                                    ".cm-activeLineGutter": {
                                        backgroundColor: "#1a2a39",
                                    },
                                    ".cm-gutters": {
                                        backgroundColor: "#0f1720",
                                        color: "#8da6bf",
                                        borderRight: "1px solid #2c4155",
                                    },
                                    "&.cm-focused": {
                                        outline: "none",
                                    },
                                }, {dark: true}),
                                ]}
                                theme="dark"
                                className="main-editor-cm"
                                basicSetup={{
                                    foldGutter: false,
                                    dropCursor: false,
                                }}
                            />
                        </div>
                    ) : (
                        <div className="empty-editor-state">
                            <div className="empty-editor-title">No file selected</div>
                            <div className="empty-editor-text">Select a file in the sidebar or create a new note.</div>
                            <div className="empty-editor-actions">
                                <button
                                    className="toolbar-btn"
                                    onClick={() => {
                                        if (!notesDir) return;
                                        setInputDialog({
                                            visible: true,
                                            mode: "createFile",
                                            path: notesDir,
                                            value: "new-note.md",
                                            title: "New File",
                                            confirmLabel: "Create",
                                        });
                                    }}
                                >
                                    New File In Root
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </main>
            {contextMenu.visible ? (
                <div
                    className="tree-context-menu"
                    style={{left: contextMenu.x, top: contextMenu.y}}
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        className="tree-context-item"
                        onClick={() => {
                            const current = contextMenu.path.split("/").pop() || "";
                            setInputDialog({
                                visible: true,
                                mode: "rename",
                                path: contextMenu.path,
                                value: current,
                                title: "Rename",
                                confirmLabel: "Rename",
                            });
                            setContextMenu((prev) => ({...prev, visible: false}));
                        }}
                    >
                        Rename
                    </button>
                    <button
                        className="tree-context-item danger"
                        onClick={() => {
                            setConfirmDialog({
                                visible: true,
                                path: contextMenu.path,
                                isDir: contextMenu.isDir,
                                message: `Delete ${contextMenu.isDir ? "folder" : "file"}: ${toDisplayPath(contextMenu.path, notesDir)}?`,
                            });
                            setContextMenu((prev) => ({...prev, visible: false}));
                        }}
                    >
                        Delete
                    </button>
                    {contextMenu.isDir ? (
                        <>
                            <button
                                className="tree-context-item"
                                onClick={() => {
                                    setInputDialog({
                                        visible: true,
                                        mode: "createFile",
                                        path: contextMenu.path,
                                        value: "new-note.md",
                                        title: "New File",
                                        confirmLabel: "Create",
                                    });
                                    setContextMenu((prev) => ({...prev, visible: false}));
                                }}
                            >
                                New File
                            </button>
                            <button
                                className="tree-context-item"
                                onClick={() => {
                                    setInputDialog({
                                        visible: true,
                                        mode: "createFolder",
                                        path: contextMenu.path,
                                        value: "new-folder",
                                        title: "New Folder",
                                        confirmLabel: "Create",
                                    });
                                    setContextMenu((prev) => ({...prev, visible: false}));
                                }}
                            >
                                New Folder
                            </button>
                        </>
                    ) : null}
                </div>
            ) : null}
            {editorContextMenu.visible ? (
                <div
                    className="tree-context-menu"
                    style={{left: editorContextMenu.x, top: editorContextMenu.y}}
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        className="tree-context-item"
                        onClick={() => toggleSensitive()}
                    >
                        Toggle Sensitive
                    </button>
                </div>
            ) : null}
            {inputDialog.visible ? (
                <div className="dialog-backdrop" onClick={() => setInputDialog((prev) => ({...prev, visible: false}))}>
                    <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
                        <div className="dialog-title">{inputDialog.title}</div>
                        <input
                            className="dialog-input"
                            autoFocus
                            value={inputDialog.value}
                            onChange={(event) => setInputDialog((prev) => ({...prev, value: event.target.value}))}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    void submitInputDialog();
                                }
                            }}
                        />
                        <div className="dialog-actions">
                            <button
                                className="toolbar-btn"
                                onClick={() => setInputDialog((prev) => ({...prev, visible: false}))}
                            >
                                Cancel
                            </button>
                            <button className="toolbar-btn" onClick={() => void submitInputDialog()}>
                                {inputDialog.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
            {confirmDialog.visible ? (
                <div className="dialog-backdrop" onClick={() => setConfirmDialog((prev) => ({...prev, visible: false}))}>
                    <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
                        <div className="dialog-title">{confirmDialog.message}</div>
                        <div className="dialog-actions">
                            <button
                                className="toolbar-btn"
                                onClick={() => setConfirmDialog((prev) => ({...prev, visible: false}))}
                            >
                                Cancel
                            </button>
                            <button className="toolbar-btn" onClick={() => void submitConfirmDialog()}>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
            {showSecuritySetup ? (
                <div className="dialog-backdrop">
                    <div className="dialog-panel security-setup-panel">
                        <div className="dialog-title">Choose Encryption Setup</div>
                        <div className="dialog-text">
                            Decide once how sensitive note regions are unlocked on this device.
                        </div>
                        <button className="toolbar-btn setup-btn" onClick={() => void setupGenerated()}>
                            Generate secure key and store in OS keychain (Recommended)
                        </button>
                        <button className="toolbar-btn setup-btn" onClick={() => void setupManual()}>
                            Always enter passphrase manually
                        </button>
                    </div>
                </div>
            ) : null}
            {showSecuritySettings ? (
                <div className="dialog-backdrop" onClick={() => setShowSecuritySettings(false)}>
                    <div className="dialog-panel security-settings-panel" onClick={(event) => event.stopPropagation()}>
                        <div className="dialog-title">Security Settings</div>
                        <div className="dialog-text">Current mode: <strong>{securityMode || "unset"}</strong></div>
                        <div className="security-settings-grid">
                            <button className="toolbar-btn setup-btn" onClick={() => void setupGenerated()}>
                                Switch to generated keychain mode
                            </button>
                            <button className="toolbar-btn setup-btn" onClick={() => void setupManual()}>
                                Switch to manual passphrase mode
                            </button>
                            {securityMode === "generated" ? (
                                <>
                                    <button className="toolbar-btn setup-btn" onClick={() => void exportRecoveryKey()}>
                                        Export recovery key
                                    </button>
                                    {recoveryKey ? (
                                        <textarea
                                            className="dialog-textarea"
                                            value={recoveryKey}
                                            readOnly
                                        />
                                    ) : null}
                                </>
                            ) : null}
                            <input
                                className="dialog-input"
                                value={importRecoveryKey}
                                onChange={(event) => setImportRecoveryKey(event.target.value)}
                                placeholder="Paste recovery key to import"
                            />
                            <button
                                className="toolbar-btn setup-btn"
                                onClick={() => void importRecovery()}
                                disabled={!importRecoveryKey.trim()}
                            >
                                Import recovery key
                            </button>
                            <div className="dialog-text">
                                Re-encrypt all existing encrypted regions (for mode/passphrase migrations).
                            </div>
                            <input
                                className="dialog-input"
                                type="password"
                                value={migrationOldPass}
                                onChange={(event) => setMigrationOldPass(event.target.value)}
                                placeholder="Old passphrase"
                            />
                            <input
                                className="dialog-input"
                                type="password"
                                value={migrationNewPass}
                                onChange={(event) => setMigrationNewPass(event.target.value)}
                                placeholder="New passphrase"
                            />
                            <button
                                className="toolbar-btn setup-btn"
                                onClick={() => void reencryptAllNotes()}
                                disabled={!migrationOldPass.trim() || !migrationNewPass.trim()}
                            >
                                Re-encrypt notes
                            </button>
                        </div>
                        <div className="dialog-actions">
                            <button className="toolbar-btn" onClick={() => setShowSecuritySettings(false)}>Close</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );

    function applyWorkspace(workspace: WorkspaceState) {
        setNotesDir(workspace.notesDir);
        setTree(workspace.tree ?? []);
        setSecurityMode(workspace.securityMode || "unset");
        const dirtyMap: Record<string, boolean> = {};
        for (const p of workspace.dirtyPaths ?? []) {
            dirtyMap[p] = true;
        }
        setGitDirtyPaths(dirtyMap);
    }
}

const newLocalBlockID = (): string => {
    return `block-${Math.random().toString(16).slice(2, 10)}`;
};

const MARKER_START = "<!-- sensitive:start -->";
const MARKER_END = "<!-- sensitive:end -->";

const atxHeadingLineDecorations = ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();

        for (const {from, to} of view.visibleRanges) {
            let line = view.state.doc.lineAt(from);
            while (line.from <= to) {
                const match = line.text.match(/^(#{1,6})\s+/);
                if (match) {
                    const level = Math.min(match[1].length, 6);
                    builder.add(line.from, line.from, Decoration.line({
                        class: `cm-atx-h${level}`,
                    }));
                }
                if (line.to >= to) {
                    break;
                }
                line = view.state.doc.line(line.number + 1);
            }
        }

        return builder.finish();
    }
}, {
    decorations: (value) => value.decorations,
});

const fencedCodeLineDecorations = ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const lineCount = view.state.doc.lines;

        let inFence = false;
        let fenceChar = "";
        let fenceLen = 0;

        for (let lineNo = 1; lineNo <= lineCount; lineNo++) {
            const line = view.state.doc.line(lineNo);
            if (!inFence) {
                const open = parseFenceOpen(line.text);
                if (!open) {
                    continue;
                }
                inFence = true;
                fenceChar = open.char;
                fenceLen = open.length;
                builder.add(line.from, line.from, Decoration.line({class: "cm-codeblock-start"}));
                continue;
            }

            if (isFenceClose(line.text, fenceChar, fenceLen)) {
                builder.add(line.from, line.from, Decoration.line({class: "cm-codeblock-end"}));
                inFence = false;
                fenceChar = "";
                fenceLen = 0;
                continue;
            }

            builder.add(line.from, line.from, Decoration.line({class: "cm-codeblock-mid"}));
        }

        return builder.finish();
    }
}, {
    decorations: (value) => value.decorations,
});

const inlineCodeDecorations = ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView) {
        const builder = new RangeSetBuilder<Decoration>();
        const lineCount = view.state.doc.lines;

        let inFence = false;
        let fenceChar = "";
        let fenceLen = 0;

        for (let lineNo = 1; lineNo <= lineCount; lineNo++) {
            const line = view.state.doc.line(lineNo);

            if (!inFence) {
                const open = parseFenceOpen(line.text);
                if (open) {
                    inFence = true;
                    fenceChar = open.char;
                    fenceLen = open.length;
                    continue;
                }
            } else {
                if (isFenceClose(line.text, fenceChar, fenceLen)) {
                    inFence = false;
                    fenceChar = "";
                    fenceLen = 0;
                }
                continue;
            }

            const re = /`[^`\n]+`/g;
            let match: RegExpExecArray | null;
            while ((match = re.exec(line.text)) !== null) {
                const start = line.from + match.index;
                const end = start + match[0].length;
                builder.add(start, end, Decoration.mark({class: "cm-inline-code-pill"}));
            }
        }

        return builder.finish();
    }
}, {
    decorations: (value) => value.decorations,
});

const parseFenceOpen = (line: string): {char: string; length: number} | null => {
    const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (!match) return null;
    return {
        char: match[1][0],
        length: match[1].length,
    };
};

const isFenceClose = (line: string, marker: string, minLen: number): boolean => {
    const escaped = marker === "`" ? "\\`" : "~";
    const re = new RegExp(`^[ \\t]{0,3}${escaped}{${minLen},}[ \\t]*$`);
    return re.test(line);
};

const parseSensitiveBlocksFromLines = (lines: string[], noteSensitive: boolean): Block[] => {
    const withIDs = lines.map((line) => ({
        id: newLocalBlockID(),
        markdown: line,
        sensitive: false,
    }));

    if (noteSensitive) {
        return withIDs;
    }

    let inSensitiveRegion = false;
    const result: Block[] = [];

    for (const line of withIDs) {
        const trimmed = line.markdown.trim();
        if (trimmed === MARKER_START) {
            inSensitiveRegion = true;
            continue;
        }
        if (trimmed === MARKER_END) {
            inSensitiveRegion = false;
            continue;
        }
        result.push({
            ...line,
            sensitive: inSensitiveRegion,
        });
    }

    return result;
};

const buildEditorLines = (stored: Block[], noteSensitive: boolean): string[] => {
    if (noteSensitive) {
        return stored.map((line) => line.markdown);
    }

    const result: string[] = [];
    let inSensitiveRegion = false;
    for (const line of stored) {
        if (line.sensitive && !inSensitiveRegion) {
            result.push(MARKER_START);
            inSensitiveRegion = true;
        }
        if (!line.sensitive && inSensitiveRegion) {
            result.push(MARKER_END);
            inSensitiveRegion = false;
        }
        result.push(line.markdown);
    }
    if (inSensitiveRegion) {
        result.push(MARKER_END);
    }

    return result;
};

const findSensitiveRegionAroundSelection = (
    text: string,
    from: number,
    to: number,
): { startLine: number; endLine: number } | null => {
    const lines = text.split("\n");
    const lineStarts: number[] = [];
    let offset = 0;
    for (const line of lines) {
        lineStarts.push(offset);
        offset += line.length + 1;
    }

    const posToLine = (pos: number) => {
        let idx = 0;
        for (let i = 0; i < lineStarts.length; i++) {
            if (lineStarts[i] <= pos) idx = i;
            else break;
        }
        return idx;
    };

    const startLine = posToLine(from);
    const endLine = posToLine(Math.max(from, to - 1));

    let openStart = -1;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === MARKER_START) {
            openStart = i;
            continue;
        }
        if (trimmed === MARKER_END && openStart >= 0) {
            const contentStart = openStart + 1;
            const contentEnd = i - 1;
            if (
                (
                    (contentStart <= contentEnd &&
                        startLine >= contentStart &&
                        endLine <= contentEnd) ||
                    (startLine <= openStart && endLine >= i)
                )
            ) {
                return {startLine: openStart, endLine: i};
            }
            openStart = -1;
        }
    }

    return null;
};

const removeSensitiveRegionMarkers = (text: string, markerStartLine: number, markerEndLine: number): string => {
    const lines = text.split("\n");
    const next = lines.filter((_, index) => index !== markerStartLine && index !== markerEndLine);
    return next.join("\n");
};

const TreeNodes = ({
                       nodes,
                       depth,
                       selectedFile,
                       hasUnsavedChanges,
                       gitDirtyPaths,
                       expandedDirs,
                       onToggleDir,
                       onContextMenu,
                       onSelectFile,
                   }: {
    nodes: FileNode[];
    depth: number;
    selectedFile: string;
    hasUnsavedChanges: boolean;
    gitDirtyPaths: Record<string, boolean>;
    expandedDirs: Record<string, boolean>;
    onToggleDir: (dirPath: string) => void;
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>, path: string, isDir: boolean) => void;
    onSelectFile: (file: string) => void;
}) => {
    return (
        <>
            {nodes.map((node) => (
                <div key={node.path}>
                    <div
                        className={`tree-node ${node.isDir ? "dir" : "file"} ${selectedFile === node.path ? "selected" : ""}`}
                        style={{paddingLeft: `${depth * 14 + 8}px`}}
                        onClick={() => {
                            if (node.isDir) {
                                onToggleDir(node.path);
                            } else {
                                onSelectFile(node.path);
                            }
                        }}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onContextMenu(event, node.path, node.isDir);
                        }}
                    >
                        <span className="tree-icon">
                            {node.isDir ? (
                                expandedDirs[node.path] ? <ChevronDownIcon/> : <ChevronRightIcon/>
                            ) : (
                                isMarkdownOrTextFile(node.name) ? <NoteFileIcon/> : <span className="tree-icon-spacer"/>
                            )}
                        </span>
                        <span className="tree-label">{node.name}</span>
                        {!node.isDir && selectedFile === node.path && hasUnsavedChanges ? (
                            <span className="tree-badge unsaved">unsaved</span>
                        ) : null}
                        {!node.isDir && gitDirtyPaths[node.path] ? (
                            <span className="tree-badge git">uncommitted</span>
                        ) : null}
                    </div>
                    {node.isDir && expandedDirs[node.path] && node.children && node.children.length > 0 ? (
                        <TreeNodes
                            nodes={node.children}
                            depth={depth + 1}
                            selectedFile={selectedFile}
                            hasUnsavedChanges={hasUnsavedChanges}
                            gitDirtyPaths={gitDirtyPaths}
                            expandedDirs={expandedDirs}
                            onToggleDir={onToggleDir}
                            onContextMenu={onContextMenu}
                            onSelectFile={onSelectFile}
                        />
                    ) : null}
                </div>
            ))}
        </>
    );
};

const toDisplayPath = (absolutePath: string, root: string): string => {
    if (!root) return absolutePath;
    const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
    if (absolutePath.startsWith(normalizedRoot)) {
        return absolutePath.slice(normalizedRoot.length);
    }
    return absolutePath;
};

const ChevronRightIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const ChevronDownIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 7L10 13L16 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const NoteFileIcon = () => (
    <svg width="20" height="17" viewBox="0 0 24 20" fill="none" aria-hidden="true">
        <path d="M5 2H14L19 7V18H5V2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M14 2V7H19" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M8 11H16M8 14H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
);

const isMarkdownOrTextFile = (name: string): boolean => {
    const lower = name.toLowerCase();
    return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx") || lower.endsWith(".txt");
};

export default App;
