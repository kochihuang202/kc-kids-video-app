// Real Windows non-client hit-testing, not a CSS-only drag-region assertion.
const { _electron, expect } = require('@playwright/test'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
function hitTests({ handle, points }) {
    const script = `$ProgressPreference='SilentlyContinue';Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class InkBridgeHitTest { [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr h,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result); }'
 $results=@();${points.map(p => `$value=[IntPtr]::Zero;$sent=[InkBridgeHitTest]::SendMessageTimeout([IntPtr]${handle},0x84,[IntPtr]::Zero,[IntPtr](${p.x}+(${p.y} -shl 16)),2,2000,[ref]$value);if($sent -eq [IntPtr]::Zero){throw 'Native hit test failed'};$results+=[int]$value`).join('\n')}
 ConvertTo-Json -Compress -InputObject $results`;
    return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true }));
}
(async () => {
    if (process.platform !== 'win32')
        throw Error('Windows native test required');
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-original-modules-title-drag-')), env = { ...process.env, INKBRIDGE_ORIGINAL_PROBE_DATA: data, INKBRIDGE_ORIGINAL_VIEW: 'board' };
    delete env.ELECTRON_RUN_AS_NODE;
    const { WorkspaceDatabase } = require('../../src/main/database.cjs'), db = new WorkspaceDatabase(path.join(data, 'Workspace/inkbridge.sqlite3'));
    for (let i = 0; i < 18; i++)
        db.history({ method: 'createHistoryTab', payload: { id: 'long-tab-' + i, sourceId: 'long-board-' + i, type: 'Whiteboard', title: '原版模組移植驗證白板-' + i, tabGroupId: 'default' } });
    db.close();
    const app = await _electron.launch({ args: [path.join(__dirname, 'host.cjs')], executablePath: require('electron'), env });
    let page;
    try {
        page = await app.firstWindow();
        await page.waitForFunction(() => window.__inkbridgeIntegrated?.ready);
        await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.unmaximize(); win.setBounds({ x: 40, y: 60, width: 1200, height: 900 }); });
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1200);
        if (process.env.INKBRIDGE_TEST_MAXIMIZED === '1')
            await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
        if (process.env.INKBRIDGE_TEST_MAXIMIZED === '1')
            await expect.poll(() => page.evaluate(() => innerWidth)).toBeGreaterThan(1200);
        const samples = await page.evaluate(() => { const rect = s => document.querySelector(s).getBoundingClientRect(), nav = rect('#original-navigation-controls'), history = rect('#original-history-tabs'), tabs = rect('[data-tour="history-tabs"]'), button = rect('#toggle-sidebar'); return [{ name: 'left blank', x: nav.right - 35, y: 18 }, { name: 'right blank', x: (tabs.right + history.right) / 2, y: 18 }, { name: 'sidebar button', x: button.x + button.width / 2, y: button.y + button.height / 2 }, { name: 'history tab', x: tabs.x + 45, y: 18 }]; });
        const checks = samples.filter(point => point.name !== 'right blank');
        const args = await app.evaluate(({ BrowserWindow, screen }, samples) => { const win = BrowserWindow.getAllWindows()[0], bounds = win.getContentBounds(), handle = win.getNativeWindowHandle(); return { handle: handle.length === 8 ? Number(handle.readBigUInt64LE()) : handle.readUInt32LE(), points: samples.map(p => screen.dipToScreenPoint({ x: Math.round(bounds.x + p.x), y: Math.round(bounds.y + p.y) })) }; }, checks);
        const hits = await expect.poll(() => hitTests(args)).toEqual([2, 1, 1]).then(() => hitTests(args));
        console.log(JSON.stringify(checks.map((p, i) => ({ name: p.name, hit: hits[i] }))));
        assert.deepEqual(hits, [2, 1, 1], 'blank areas must be HTCAPTION; controls must be HTCLIENT');
        if (process.env.INKBRIDGE_TEST_MAXIMIZED !== '1') {
            await app.evaluate(({ app }) => app.focus({ steal: true }));
            await page.bringToFront();
            const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds()), start = args.points[0];
            const moveScript = `$ProgressPreference='SilentlyContinue';Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class InkBridgeMouse { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e); }'; [InkBridgeMouse]::SetCursorPos(${start.x},${start.y})|Out-Null;[InkBridgeMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 100;1..10|ForEach-Object{[InkBridgeMouse]::SetCursorPos((${start.x}+$_*6),(${start.y}+$_*4))|Out-Null;Start-Sleep -Milliseconds 20};[InkBridgeMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`;
            execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(moveScript, 'utf16le').toString('base64')], { windowsHide: true });
            await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().x)).toBeGreaterThan(before.x + 30);
            console.log(JSON.stringify({ realWindowsMouseDragMovedWindow: true }));
        }
        await app.evaluate(({ app }) => app.focus({ steal: true }));
        await page.bringToFront();
        await page.locator('#toggle-sidebar').click();
        await expect.poll(() => page.evaluate(() => window.__originalRequire(63268).Z.getState().ui.leftSidebarShow)).toBe(false);
        await expect.poll(() => page.locator('#board').evaluate(el => el.getBoundingClientRect().x)).toBe(0);
        await page.locator('#toggle-sidebar').click();
        await expect.poll(() => page.locator('#board').evaluate(el => el.getBoundingClientRect().x)).toBe(260);
        assert.deepEqual(await page.evaluate(() => window.__inkbridgeIntegrated.errors), []);
        console.log(JSON.stringify({ windowsNativeCaptionRegions: true, buttonsRemainInteractive: true }));
    }
    catch (e) {
        console.error(e);
        await app.evaluate(({ app }) => app.exit(1)).catch(() => { });
        throw e;
    }
    finally {
        await app.close().catch(() => { });
    }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
