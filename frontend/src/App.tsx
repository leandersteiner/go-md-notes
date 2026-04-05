import {useEffect, useRef, useState} from 'react';
import './App.css';
import {Block} from "./types/Block";
import {
    ChooseNotesDir,
    CreateFile,
    CreateFolder,
    DeletePath,
    InitWorkspace,
    LoadNote,
    RefreshWorkspace,
    RenamePath,
    SaveNote
} from "../wailsjs/go/main/App";
import CodeMirror from "@uiw/react-codemirror";
import {markdown} from "@codemirror/lang-markdown";
import {syntaxHighlighting, HighlightStyle} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {EditorView, keymap} from "@codemirror/view";
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
    const [password, setPassword] = useState("");
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

    const makeSensitive = () => {
        const from = selectionRef.current.from;
        const to = selectionRef.current.to;
        const hasSelection = to > from;
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
                    placeholder="Password for sensitive blocks"
                />
                <button className="toolbar-btn" onClick={chooseFolder}>Choose Folder</button>
                <button className="toolbar-btn" onClick={reloadTree}>Refresh Tree</button>
                <button className="toolbar-btn" onClick={save} disabled={!activeFilePath}>Save</button>
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
                                syntaxHighlighting(headingHighlightStyle),
                                EditorView.lineWrapping,
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
                                    },
                                    ".cm-scroller": {
                                        overflow: "auto",
                                        fontFamily: "\"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, monospace",
                                    },
                                    ".cm-content": {
                                        padding: "1rem",
                                        caretColor: "#e9f0f6",
                                    },
                                    ".cm-line": {
                                        color: "#d8e3ee",
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
                        onClick={() => makeSensitive()}
                    >
                        Make Sensitive
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
            <div className="hint">
                Single pane editor. Inline sensitive sections use markers: &lt;!-- sensitive:start --&gt; / &lt;!-- sensitive:end --&gt;.
                Shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+Shift+O choose folder, Ctrl/Cmd+Shift+R refresh tree, Ctrl/Cmd+Shift+P toggle full-note sensitivity.
            </div>
        </div>
    );

    function applyWorkspace(workspace: WorkspaceState) {
        setNotesDir(workspace.notesDir);
        setTree(workspace.tree ?? []);
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

const headingHighlightStyle = HighlightStyle.define([
    {tag: tags.heading1, fontSize: "2em", fontWeight: "700", color: "#f5fbff"},
    {tag: tags.heading2, fontSize: "1.7em", fontWeight: "700", color: "#eef8ff"},
    {tag: tags.heading3, fontSize: "1.45em", fontWeight: "700", color: "#e7f4ff"},
    {tag: tags.heading4, fontSize: "1.25em", fontWeight: "700", color: "#ddecfb"},
    {tag: tags.heading5, fontSize: "1.1em", fontWeight: "700", color: "#d2e3f3"},
    {tag: tags.heading6, fontSize: "1em", fontWeight: "700", color: "#c6d8e8"},
]);

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
