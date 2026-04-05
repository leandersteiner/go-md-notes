export const toDisplayPath = (absolutePath: string, root: string): string => {
    if (!root) return absolutePath;
    const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
    if (absolutePath.startsWith(normalizedRoot)) {
        return absolutePath.slice(normalizedRoot.length);
    }
    return absolutePath;
};
