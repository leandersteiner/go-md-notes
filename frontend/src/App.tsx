import {useState} from 'react';
import './App.css';
import {Block} from "./types/Block";
import {LoadNote, SaveNote} from "../wailsjs/go/main/App";
import CodeMirror from "@uiw/react-codemirror";
import {markdown} from "@codemirror/lang-markdown";
import {syntaxHighlighting, HighlightStyle} from "@codemirror/language";
import {tags} from "@lezer/highlight";
import {EditorView} from "@codemirror/view";

function App() {
    const [notePath, setNotePath] = useState("notes.md");
    const [password, setPassword] = useState("");
    const [noteSensitive, setNoteSensitive] = useState(false);
    const [status, setStatus] = useState("Ready");
    const [editorText, setEditorText] = useState("# New note");

    const load = async () => {
        try {
            const doc = await LoadNote(notePath, password);
            const rebuilt = buildEditorLines(doc.blocks, doc.noteSensitive);
            setEditorText(rebuilt.join("\n"));
            setNoteSensitive(doc.noteSensitive);
            setStatus(`Loaded`);
        } catch (e) {
            setStatus(`Load failed: ${String(e)}`);
        }
    };

    const save = async () => {
        try {
            const lines = editorText.split("\n");
            const prepared = parseSensitiveBlocksFromLines(lines, noteSensitive);
            await SaveNote(notePath, prepared, password, noteSensitive);
            setStatus(`Saved`);
        } catch (e) {
            setStatus(`Save failed: ${String(e)}`);
        }
    };

    return (
        <div id="App" className="app-shell">
            <header className="toolbar">
                <input
                    className="toolbar-input"
                    value={notePath}
                    onChange={(e) => setNotePath(e.target.value)}
                    placeholder="notes.md"
                />
                <input
                    className="toolbar-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="Password for sensitive blocks"
                />
                <button className="toolbar-btn" onClick={load}>Load</button>
                <button className="toolbar-btn" onClick={save}>Save</button>
                <button className="toolbar-btn" onClick={() => setNoteSensitive((v) => !v)}>
                    {noteSensitive ? "Full Note: Sensitive" : "Full Note: Public"}
                </button>
                <span className="status">{status}</span>
            </header>
            <main className="editor-container">
                <CodeMirror
                    value={editorText}
                    onChange={(value) => setEditorText(value)}
                    extensions={[
                        markdown(),
                        syntaxHighlighting(headingHighlightStyle),
                        EditorView.lineWrapping,
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
            </main>
            <div className="hint">
                Single pane editor. Inline sensitive sections use markers: &lt;!-- sensitive:start --&gt; / &lt;!-- sensitive:end --&gt;.
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

export default App;
