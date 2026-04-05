import {useState} from 'react';
import './App.css';
import {Editor} from "./components/Editor";
import {Block} from "./types/Block";
import {LoadNote, SaveNote} from "../wailsjs/go/main/App";

function App() {
    const [notePath, setNotePath] = useState("notes.md");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState("Ready");
    const [blocks, setBlocks] = useState<Block[]>([{
        id: newLocalBlockID(),
        markdown: "# New note",
        sensitive: false,
    }]);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(blocks[0]?.id ?? null);

    const onUpdateBlock = (id: string, markdown: string) => {
        setBlocks((prev) => prev.map((b) => b.id === id ? {...b, markdown} : b));
    };

    const onToggleSensitive = (id: string) => {
        setBlocks((prev) => prev.map((b) => b.id === id ? {...b, sensitive: !b.sensitive} : b));
    };

    const onAddBlock = () => {
        const next: Block = {id: newLocalBlockID(), markdown: "", sensitive: false};
        setBlocks((prev) => [...prev, next]);
        setActiveBlockId(next.id);
    };

    const load = async () => {
        try {
            const loaded = await LoadNote(notePath, password);
            const normalized = loaded.length > 0 ? loaded : [{id: newLocalBlockID(), markdown: "", sensitive: false}];
            setBlocks(normalized);
            setActiveBlockId(normalized[0]?.id ?? null);
            setStatus(`Loaded ${normalized.length} block(s)`);
        } catch (e) {
            setStatus(`Load failed: ${String(e)}`);
        }
    };

    const save = async () => {
        try {
            await SaveNote(notePath, blocks, password);
            setStatus(`Saved ${blocks.length} block(s)`);
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
                <span className="status">{status}</span>
            </header>
            <main className="editor-container">
                <Editor
                    blocks={blocks}
                    activeBlockId={activeBlockId}
                    onSelectBlock={setActiveBlockId}
                    onUpdateBlock={onUpdateBlock}
                    onToggleSensitive={onToggleSensitive}
                    onAddBlock={onAddBlock}
                />
            </main>
            <div className="hint">
                Active block is raw markdown; all other blocks are preview.
            </div>
        </div>
    );
}

const newLocalBlockID = (): string => {
    return `block-${Math.random().toString(16).slice(2, 10)}`;
};

export default App;
