import readline from 'readline';
export const cleanupFunctions = [];
export const syncCleanupFunctions = [];
export let isShuttingDown = false;

export function registerCleanup(fn) {
    cleanupFunctions.push(fn);
}

export function removeCleanup(fn) {
    const index = cleanupFunctions.indexOf(fn);
    if (index !== -1) {
        cleanupFunctions.splice(index, 1);
    }
}

export async function performGracefulShutdown(exitCode = 0) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    for (const fn of syncCleanupFunctions) {
        try { fn(); } catch (e) {}
    }
    for (const fn of cleanupFunctions) {
        try { await fn(); } catch (e) {}
    }
    
    restoreTerminal();
    process.exit(exitCode);
}

export function setupTerminal() {
    if (!process.stdout.isTTY) return;
    readline.emitKeypressEvents(process.stdin);
    const rows = process.stdout.rows;
    // Set scroll margins: 1 to rows - 1
    process.stdout.write(`\x1b[1;${rows - 1}r`);
    
    // Listen for resize to update scroll margins
    process.stdout.on('resize', () => {
        if (!isShuttingDown && process.stdout.isTTY) {
            const newRows = process.stdout.rows;
            process.stdout.write(`\x1b[1;${newRows - 1}r`);
        }
    });
}

export function restoreTerminal() {
    if (!process.stdout.isTTY) return;
    // Reset scroll margins
    process.stdout.write('\x1b[r');
    // Clear bottom line
    const rows = process.stdout.rows;
    process.stdout.write(`\x1b[${rows};1H\x1b[2K`);
    // Put cursor back to a clean position
    process.stdout.write('\r\n');
}
