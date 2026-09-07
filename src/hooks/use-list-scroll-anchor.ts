"use client";

import { useLayoutEffect, useRef } from "react";

interface ScrollSnapshot {
    scrollTop: number;
    anchor: HTMLElement | null;
    anchorOffset: number;
    focusedElement: HTMLElement | null;
}

export function useListScrollAnchor() {
    const listRef = useRef<HTMLDivElement>(null);
    const snapshotRef = useRef<ScrollSnapshot | null>(null);

    function preserveScroll(changedKeys: ReadonlySet<string>) {
        const list = listRef.current;
        if (!list) return;

        const bounds = list.getBoundingClientRect();
        const visibleRows = Array.from(
            list.querySelectorAll<HTMLElement>("[data-scroll-anchor]"),
        ).filter((row) => {
            const rowBounds = row.getBoundingClientRect();
            return rowBounds.bottom > bounds.top && rowBounds.top < bounds.bottom;
        });
        // Follow a visible neighbour, not the language being moved to another group.
        // At the top, keep the top visible so newly selected languages appear there.
        const anchor =
            list.scrollTop < 1
                ? null
                : (visibleRows.find((row) => !changedKeys.has(row.dataset["scrollAnchor"] ?? "")) ??
                  visibleRows[0] ??
                  null);
        const focusedElement = list.ownerDocument.activeElement;
        snapshotRef.current = {
            scrollTop: list.scrollTop,
            anchor,
            anchorOffset: anchor ? anchor.getBoundingClientRect().top - bounds.top : 0,
            focusedElement:
                focusedElement instanceof HTMLElement && list.contains(focusedElement)
                    ? focusedElement
                    : null,
        };
    }

    useLayoutEffect(() => {
        const list = listRef.current;
        const snapshot = snapshotRef.current;
        snapshotRef.current = null;
        if (!list || !snapshot) return;

        const { anchor, focusedElement } = snapshot;
        if (anchor && list.contains(anchor)) {
            const offset = anchor.getBoundingClientRect().top - list.getBoundingClientRect().top;
            list.scrollTop += offset - snapshot.anchorOffset;
        } else {
            list.scrollTop = snapshot.scrollTop;
        }
        // Reordering a focused checkbox can blur it; restoring focus must not scroll.
        if (focusedElement?.isConnected && list.ownerDocument.activeElement !== focusedElement) {
            focusedElement.focus({ preventScroll: true });
        }
    });

    return { listRef, preserveScroll };
}
