export function isDialogBackdropClick(event: { currentTarget: HTMLDialogElement; clientX: number; clientY: number }) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
}
