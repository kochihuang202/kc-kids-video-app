let publishing = null;
// Explicit whole-workspace choice, distinct from selecting local fields in a
// merge. Receivers preserve their unsynced checkpoint before aligning once.
export function publishThisComputer() {
    if (publishing)
        return publishing;
    publishing = window.inkbridge.sync({ method: 'authoritativeLocal' }).then(result => { window.dispatchEvent(new Event('inkbridge:snapshot-list-changed')); window.dispatchEvent(new Event('inkbridge:merge-completed')); return result; }).finally(() => publishing = null);
    return publishing;
}
