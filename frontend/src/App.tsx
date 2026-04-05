import {useEffect, useState} from 'react';
import './App.css';
import {Block} from "./types/Block";
import {ChooseNotesDir, InitWorkspace, LoadNote, RefreshWorkspace, SaveNote} from "../wailsjs/go/main/App";
import CodeMirror from "@uiw/react-codemirror";
import {markdown} from "@codemirror/lang-markdown";
import {syntaxHighlighting, HighlightStyle} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {EditorView, keymap} from "@codemirror/view";

type FileNode = {
    name: string;
    path: string;
    isDir: boolean;
    children?: FileNode[];
}

function App() {
    const [notesDir, setNotesDir] = useState("");
    const [tree, setTree] = useState<FileNode[]>([]);
    const [activeFilePath, setActiveFilePath] = useState("");
    const [password, setPassword] = useState("");
    const [noteSensitive, setNoteSensitive] = useState(false);
    const [status, setStatus] = useState("Ready");
    const [editorText, setEditorText] = useState("# New note");
    const [loadingFile, setLoadingFile] = useState(false);
    const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const bootstrap = async () => {
            try {
                const workspace = await InitWorkspace();
                setNotesDir(workspace.notesDir);
                setTree(workspace.tree ?? []);
                setStatus("Workspace ready");
            } catch (e) {
                setStatus(`Workspace setup failed: ${String(e)}`);
            }
        };
        void bootstrap();
    }, []);

    const reloadTree = async () => {
        try {
            const workspace = await RefreshWorkspace();
            setNotesDir(workspace.notesDir);
            setTree(workspace.tree ?? []);
            setStatus("Tree refreshed");
        } catch (e) {
            setStatus(`Refresh failed: ${String(e)}`);
        }
    };

    const chooseFolder = async () => {
        try {
            const workspace = await ChooseNotesDir();
            setNotesDir(workspace.notesDir);
            setTree(workspace.tree ?? []);
            setExpandedDirs({});
            setActiveFilePath("");
            setEditorText("# New note");
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
            setEditorText(rebuilt.join("\n"));
            setNoteSensitive(doc.noteSensitive);
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
            setStatus(`Saved ${toDisplayPath(activeFilePath, notesDir)}`);
            await reloadTree();
        } catch (e) {
            setStatus(`Save failed: ${String(e)}`);
        }
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
                    type="password"
                    placeholder="Password for sensitive blocks"
                />
                <button className="toolbar-btn" onClick={chooseFolder}>Choose Folder</button>
                <button className="toolbar-btn" onClick={reloadTree}>Refresh Tree</button>
                <button className="toolbar-btn" onClick={save}>Save</button>
                <button className="toolbar-btn" onClick={() => setNoteSensitive((v) => !v)}>
                    {noteSensitive ? "Full Note: Sensitive" : "Full Note: Public"}
                </button>
                <span className="status">{status}</span>
            </header>
            <main className="editor-container">
                <aside className="sidebar">
                    <div className="sidebar-title">{notesDir || "No notes folder selected"}</div>
                    <div className="file-tree">
                        {tree.length === 0 ? (
                            <div className="tree-empty">No files</div>
                        ) : (
                            <TreeNodes
                                nodes={tree}
                                depth={0}
                                selectedFile={activeFilePath}
                                expandedDirs={expandedDirs}
                                onToggleDir={(dirPath) =>
                                    setExpandedDirs((prev) => ({...prev, [dirPath]: !prev[dirPath]}))
                                }
                                onSelectFile={loadFile}
                            />
                        )}
                    </div>
                </aside>
                <section className="editor-pane">
                    <div className="editor-path">
                        {activeFilePath ? toDisplayPath(activeFilePath, notesDir) : "Select a file to edit"}
                    </div>
                    <CodeMirror
                        value={editorText}
                        editable={!loadingFile}
                        onChange={(value) => setEditorText(value)}
                        extensions={[
                            markdown(),
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
                </section>
            </main>
            <div className="hint">
                Single pane editor. Inline sensitive sections use markers: &lt;!-- sensitive:start --&gt; / &lt;!-- sensitive:end --&gt;.
                Shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+Shift+O choose folder, Ctrl/Cmd+Shift+R refresh tree, Ctrl/Cmd+Shift+P toggle full-note sensitivity.
            </div>
        </div>
    );
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
                       expandedDirs,
                       onToggleDir,
                       onSelectFile,
                   }: {
    nodes: FileNode[];
    depth: number;
    selectedFile: string;
    expandedDirs: Record<string, boolean>;
    onToggleDir: (dirPath: string) => void;
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
                    >
                        {node.isDir ? (expandedDirs[node.path] ? "[-]" : "[+]") : "[F]"} {node.name}
                    </div>
                    {node.isDir && expandedDirs[node.path] && node.children && node.children.length > 0 ? (
                        <TreeNodes
                            nodes={node.children}
                            depth={depth + 1}
                            selectedFile={selectedFile}
                            expandedDirs={expandedDirs}
                            onToggleDir={onToggleDir}
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

export default App;
