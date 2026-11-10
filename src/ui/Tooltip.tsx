import { useEffect, useLayoutEffect, useRef, useState } from "react";

const GAP = 8;

/**
 * One tooltip for the whole page. It shows the `data-tip` text of whatever is pointed at or
 * focused, beside that element, and moves or flips to stay inside the window.
 */
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; anchor: DOMRect } | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef<Element | null>(null);

  // Pointer and focus events on the document are the only way to follow every element with a tip.
  useEffect(() => {
    const show = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-tip]") : null;
      // Moving within the same element fires again and again; only a new target changes anything.
      if (target === shown.current) return;
      shown.current = target;
      const text = target?.getAttribute("data-tip");
      setPlace(null);
      setTip(target && text ? { text, anchor: target.getBoundingClientRect() } : null);
    };
    const hide = () => {
      shown.current = null;
      setTip(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && hide();
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey);
    // The anchor's position is stale once anything scrolls or the window changes size.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // The tooltip's size is only known once it is in the page, so it is placed after it renders.
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const { width, height } = box.current.getBoundingClientRect();
    const { anchor } = tip;
    const centred = anchor.left + anchor.width / 2 - width / 2;
    const above = anchor.top - GAP - height;
    setPlace({
      left: Math.max(GAP, Math.min(centred, window.innerWidth - width - GAP)),
      top: above >= GAP ? above : Math.min(anchor.bottom + GAP, window.innerHeight - height - GAP),
    });
  }, [tip]);

  if (!tip) return null;
  return (
    // The same text is in each element's label, so assistive technology does not need this copy.
    <div ref={box} className="tooltip" aria-hidden="true" style={place ?? { visibility: "hidden" }}>
      {tip.text}
    </div>
  );
}
