import {Block} from "../types/Block";

export const MARKER_START = "<!-- sensitive:start -->";
export const MARKER_END = "<!-- sensitive:end -->";

const newLocalBlockID = (): string => {
    return `block-${Math.random().toString(16).slice(2, 10)}`;
};

export const parseSensitiveBlocksFromLines = (lines: string[], noteSensitive: boolean): Block[] => {
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

export const buildEditorLines = (stored: Block[], noteSensitive: boolean): string[] => {
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

export const findSensitiveRegionAroundSelection = (
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

export const removeSensitiveRegionMarkers = (text: string, markerStartLine: number, markerEndLine: number): string => {
    const lines = text.split("\n");
    const next = lines.filter((_, index) => index !== markerStartLine && index !== markerEndLine);
    return next.join("\n");
};
