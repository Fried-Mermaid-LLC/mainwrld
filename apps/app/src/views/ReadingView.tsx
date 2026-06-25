import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { renderFormattedContent } from "@/utils/renderFormattedContent";
import type { BookProgress } from "@/types";
import { isChapterPublished, firstPublishedOrder } from "@/config/constants";
import { useApp } from "@/state/AppContext";
import { useReportFlow } from "@/components/reportFlow";
import * as fbService from "@/services/firebaseService";

export const ReadingView = () => {
  const {
    user,
    selectedBook,
    readerSettings,
    setReaderSettings,
    setView,
    setReadingChapterIndex,
    likedBooks,
    handleLike,
    handleSaveToLibrary,
    isBookInLibrary,
    getUserOwnedBookIds,
    allComments,
    readingChapterIndex,
    handleBookProgressUpdate,
    handleShareBook,
    getUserBookProgress,
    canSeeMature,
  } = useApp();
  const { sheet: reportSheet, startReport } = useReportFlow();
  const currentUser = user;
  const book = selectedBook;
  const savedProgress: BookProgress = selectedBook
    ? getUserBookProgress(selectedBook.id)
    : { scrollProgress: 0, chapterIndex: 0 };
  const initialScrollProgress = savedProgress.scrollProgress;
  const initialChapterIndex = savedProgress.chapterIndex;
  const initialExactPosition: any = savedProgress;
  const settings = readerSettings;
  const setSettings = setReaderSettings;
  const onBack = () => setView("book-detail");
  const onComments = (chapterIdx?: number) => {
    setReadingChapterIndex(chapterIdx ?? 0);
    setView("comments");
  };
  const likedChapters = likedBooks;
  const onLike = (chapterIdx: number) =>
    selectedBook && handleLike(selectedBook.id, chapterIdx);
  const onSave = () => selectedBook && handleSaveToLibrary(selectedBook.id);
  const isSaved = selectedBook ? isBookInLibrary(selectedBook.id) : false;
  const canSave = selectedBook
    ? user.username !== selectedBook.author.username &&
      (getUserOwnedBookIds().has(selectedBook.id) ||
        selectedBook.isFree ||
        !selectedBook.isMonetized)
    : false;
  const chapterCommentsCount = allComments.filter(
    (c: any) =>
      c.bookId === selectedBook?.id &&
      (c.chapterIndex ?? 0) === readingChapterIndex,
  ).length;
  const onProgressUpdate = (
    scrollProgress: number,
    // Index into the visible chapter list — used to persist/restore the reading
    // position (currentChapterIdx).
    visibleIdx: number,
    // Absolute chapter order — the chapter identity used by comments/URL.
    absoluteOrder: number,
    exact?: Partial<BookProgress>,
  ) => {
    setReadingChapterIndex(absoluteOrder);
    selectedBook &&
      handleBookProgressUpdate(
        selectedBook.id,
        scrollProgress,
        visibleIdx,
        exact,
      );
  };
  const onShare = () => selectedBook && handleShareBook(selectedBook);
  const [showOptions, setShowOptions] = useState(false);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(
    initialChapterIndex || 0,
  );
  const [localScrollProgress, setLocalScrollProgress] = useState(
    initialScrollProgress || 0,
  );
  // Continuous paged model. The reading position is (currentChapterIdx,
  // localPage) — the page WITHIN the active chapter. A sliding window of
  // chapters [winStart..winEnd] is rendered as one continuous multicolumn flow
  // (each chapter starts on a fresh page via break-before), so flipping across a
  // chapter boundary is simply the next/previous page — no reset. The horizontal
  // offset is derived from each chapter's MEASURED start page, so growing or
  // shrinking the window never disturbs the page the reader is on.
  const [localPage, setLocalPage] = useState(0);
  const [winStart, setWinStart] = useState(initialChapterIndex || 0);
  const [winEnd, setWinEnd] = useState(initialChapterIndex || 0);
  // transform transition is enabled only for an explicit flip; structural
  // window/measure updates re-position instantly (and invisibly, since they
  // map back to the same (chapter, localPage)).
  const [pageAnimate, setPageAnimate] = useState(false);
  const [pageWidth, setPageWidth] = useState(0);
  // Fetched chapter bodies for the rendered window, keyed by visible-chapter
  // index (shared with chapterCacheRef so a body is fetched at most once).
  const [winContent, setWinContent] = useState<Record<number, string>>({});
  // Measured layout of the window: each chapter's start page in the continuous
  // flow, its page count, and the window's total page count.
  const [layout, setLayout] = useState<{
    start: Record<number, number>;
    pages: Record<number, number>;
    total: number;
  }>({ start: {}, pages: {}, total: 1 });
  const [isBlurred, setIsBlurred] = useState(false);
  // Schema 2: chapter bodies are lazy-loaded through the getChapterContent
  // callable (paywall-enforced) into winContent, cached by chapterId so
  // re-visiting a chapter is instant.
  const chapterCacheRef = useRef<Map<string, string>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  // Paged mode: the clipping viewport (measured for page width), the translated
  // multicolumn content, and one ref per windowed chapter <section> (measured
  // for that chapter's start page).
  const pageViewportRef = useRef<HTMLDivElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const chapterSectionRefs = useRef<Record<number, HTMLElement | null>>({});
  // Body fetches in flight, keyed by visible-chapter index (dedupe).
  const fetchingRef = useRef<Set<number>>(new Set());
  // After stepping back into a not-yet-measured previous chapter, land on its
  // last page once measured.
  const pendingPrevLastRef = useRef(false);
  // Scroll-mode anchor: which windowed chapter sits at the viewport top and how
  // far we've scrolled into it. Used to keep the read position pinned when the
  // window grows/shrinks above the fold (prepend), and to persist position.
  const scrollAnchorRef = useRef<{ idx: number; offset: number }>({
    idx: initialChapterIndex || 0,
    offset: 0,
  });
  // Restore the saved page position exactly once, after the first measure.
  const pagedRestoredRef = useRef(false);
  const touchStartRef = useRef(0);
  const suppressSaveRef = useRef(true);
  const initialRef = useRef({
    scrollProgress: initialScrollProgress || 0,
    chapterIndex: initialChapterIndex || 0,
    exact: initialExactPosition || {},
  });

  // Blur content when window loses focus or visibility (prevents screenshots)
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsBlurred(document.hidden);
    };

    const handleBlur = () => {
      setIsBlurred(true);
    };

    const handleFocus = () => {
      setIsBlurred(false);
    };

    // Listen for visibility changes (tab switching, minimizing)
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    // Mobile screenshot detection (Android/iOS)
    // Detect power + volume button combinations and screenshot gestures
    let screenshotAttemptTimer: NodeJS.Timeout;
    const handleScreenshotAttempt = (e: KeyboardEvent) => {
      // Android: Power + Volume Down
      // iOS: Power + Volume Up or Power + Home
      // These trigger visibility changes, so we blur proactively
      if (e.key === "AudioVolumeDown" || e.key === "AudioVolumeUp") {
        setIsBlurred(true);
        clearTimeout(screenshotAttemptTimer);
        screenshotAttemptTimer = setTimeout(() => {
          if (!document.hidden && document.hasFocus()) {
            setIsBlurred(false);
          }
        }, 1500);
      }
    };

    window.addEventListener("keydown", handleScreenshotAttempt as any);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keydown", handleScreenshotAttempt as any);
      clearTimeout(screenshotAttemptTimer);
    };
  }, []);

  // Prevent copy/paste and screenshots in reading view
  useEffect(() => {
    const preventCopy = (e: Event) => e.preventDefault();
    const preventKeys = (e: KeyboardEvent) => {
      // Block Print Screen, Ctrl+C, Ctrl+A, Ctrl+P, Cmd+C, Cmd+A, Cmd+P
      if (
        e.key === "PrintScreen" ||
        ((e.ctrlKey || e.metaKey) &&
          ["c", "a", "p", "s"].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("copy", preventCopy);
    document.addEventListener("cut", preventCopy);
    document.addEventListener("keydown", preventKeys);
    document.addEventListener("contextmenu", preventCopy);
    return () => {
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("cut", preventCopy);
      document.removeEventListener("keydown", preventKeys);
      document.removeEventListener("contextmenu", preventCopy);
    };
  }, []);

  // A windowed chapter section's top in the scroll container's own scroll
  // coordinate (independent of container padding / positioning).
  const sectionScrollTop = (idx: number) => {
    const el = containerRef.current;
    const s = chapterSectionRefs.current[idx];
    if (!el || !s) return 0;
    return s.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
  };

  // The active chapter + the signed scroll offset relative to its top (used for
  // prepend compensation / restore — the sign matters there, so it isn't
  // clamped). A chapter becomes active once its start reaches the upper third of
  // the viewport, so the indicator switches as the next chapter's title appears
  // rather than only when its top hits the very top edge.
  const ACTIVE_LINE_FRAC = 0.33;
  const computeScrollAnchor = () => {
    const el = containerRef.current;
    if (!el) return null;
    const maxTop = el.scrollHeight - el.clientHeight;
    // Edge clamps: a chapter too short to push its top past the detection line
    // (a short last/first chapter) would otherwise never read as active. At the
    // very bottom the bottommost chapter is active; at the very top, the first.
    if (maxTop > 0 && el.scrollTop >= maxTop - 4) {
      return { idx: winEnd, offset: el.scrollTop - sectionScrollTop(winEnd) };
    }
    if (el.scrollTop <= 4) return { idx: winStart, offset: 0 };
    const refLine = el.scrollTop + el.clientHeight * ACTIVE_LINE_FRAC;
    let idx = winStart;
    for (let i = winStart; i <= winEnd; i++) {
      if (!chapterSectionRefs.current[i]) continue;
      if (sectionScrollTop(i) <= refLine) idx = i;
      else break;
    }
    return { idx, offset: el.scrollTop - sectionScrollTop(idx) };
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!settings.scrollMode) return;
    const el = e.currentTarget;
    const anchor = computeScrollAnchor();
    if (anchor) {
      scrollAnchorRef.current = anchor;
      // Like/comment act on whichever chapter is currently in view.
      if (anchor.idx !== currentChapterIdx) setCurrentChapterIdx(anchor.idx);
      // Progress = how much of the chapter has been revealed (by the viewport
      // bottom), so a short chapter that fully fits on screen reads as 100% —
      // not 0% just because you can't scroll its top past the fold.
      const h = chapterSectionRefs.current[anchor.idx]?.offsetHeight || 1;
      const revealed =
        (el.scrollTop + el.clientHeight - sectionScrollTop(anchor.idx)) / h;
      setLocalScrollProgress(
        Math.max(0, Math.min(100, Math.round(revealed * 100))),
      );
    }
    // Seamless infinite load: append the next chapter as the bottom nears, and
    // prepend the previous one (only once it's loaded, so its height is final)
    // as the top nears.
    const vh = el.clientHeight;
    if (
      el.scrollHeight - (el.scrollTop + vh) < vh &&
      winEnd < visibleChapters.length - 1
    ) {
      ensureContent(winEnd + 1);
      setWinEnd((w) => Math.min(w + 1, visibleChapters.length - 1));
    }
    if (el.scrollTop < vh && winStart > 0) {
      if (winContent[winStart - 1] !== undefined) {
        setWinStart((w) => Math.max(w - 1, 0));
      } else {
        ensureContent(winStart - 1);
      }
    }
  };

  const isAuthor = currentUser?.username === book?.author?.username;
  // Use the authoritative owned+purchased set (same as PublicBookDetailPage),
  // not the ad-hoc book.isOwned flag — so a purchased book reads in full even
  // after a reload that didn't re-hydrate isOwned, and even after the book was
  // removed from the library (purchasedBookIds is append-only / permanent).
  const isOwned = book ? getUserOwnedBookIds().has(book.id) : false;
  const isFreeOrUnmonetized = book?.isFree || !book?.isMonetized;
  const canAccessAll = isAuthor || isOwned || isFreeOrUnmonetized;

  // Chapter list comes from light metadata (chapterMeta); chapter bodies are
  // fetched lazily one at a time via the getChapterContent callable.
  const allMeta: { id: string; title: string; published?: boolean }[] =
    book?.chapterMeta || [];
  // Each visible chapter carries its absolute `order` (index in the full
  // chapterMeta). Published is now a per-chapter flag, not a contiguous prefix,
  // so likes/comments must key off `order`, never the filtered list position.
  const withOrder = allMeta.map((m, i) => ({ ...m, order: i }));
  const firstPub = firstPublishedOrder(allMeta, book?.chaptersCount);
  // Author sees all chapters (including drafts), others with access see only
  // published chapters, non-access users see only the first published chapter
  // (the free preview).
  const visibleChapters = isAuthor
    ? withOrder
    : canAccessAll
      ? withOrder.filter((m) =>
          isChapterPublished(allMeta, m.order, book?.chaptersCount),
        )
      : firstPub >= 0
        ? [withOrder[firstPub]]
        : [];
  const currentMeta = visibleChapters[currentChapterIdx];
  // Absolute chapter position — the key for likes, comments and progress.
  const currentOrder = currentMeta?.order ?? currentChapterIdx;

  // Paged (page-flip) column geometry, derived from the *measured* viewport
  // width so the page step is exact. One text column shows per page; the
  // leftover width becomes the inter-column gap, split as symmetric side
  // padding. Because colWidth + colGap === pageWidth exactly, translating the
  // content by a whole pageWidth lands the next column perfectly centered.
  const PAGE_MAX_MEASURE = 640;
  const PAGE_MIN_MARGIN = 24;
  const pagedColWidth =
    pageWidth > 0
      ? Math.min(pageWidth - PAGE_MIN_MARGIN * 2, PAGE_MAX_MEASURE)
      : 0;
  const pagedColGap = pageWidth > 0 ? pageWidth - pagedColWidth : 0;
  const pagedSidePadding = pagedColGap / 2;
  // Page-flip arrows sit just outside the centered column (button is w-12 =
  // 48px plus a 16px gap), clamped to 8px so they stay near the window edge on
  // narrow screens where the column nearly fills the width.
  const pagedArrowInset = `${Math.max(8, pagedSidePadding - 64)}px`;
  // Whether the reader sits at the very first / last page of the whole book, so
  // the corresponding page-flip arrow can be hidden (nowhere left to go).
  const atBookStart = currentChapterIdx <= 0 && localPage <= 0;
  const atBookEnd =
    currentChapterIdx >= visibleChapters.length - 1 &&
    localPage >= (layout.pages[currentChapterIdx] ?? 1) - 1;

  // Fetch a windowed chapter body into winContent (paged mode), deduped via
  // fetchingRef and the shared chapterCacheRef. Out-of-range indices no-op.
  const ensureContent = useCallback(
    (idx: number) => {
      if (!book) return;
      const meta = visibleChapters[idx];
      if (!meta) return;
      const cached = chapterCacheRef.current.get(meta.id);
      if (cached !== undefined) {
        setWinContent((prev) =>
          prev[idx] !== undefined ? prev : { ...prev, [idx]: cached },
        );
        return;
      }
      if (fetchingRef.current.has(idx)) return;
      fetchingRef.current.add(idx);
      fbService
        .fetchChapterContent(book.id, meta.id)
        .then((res) => {
          chapterCacheRef.current.set(meta.id, res.content);
          setWinContent((prev) => ({ ...prev, [idx]: res.content }));
        })
        .catch(() => setWinContent((prev) => ({ ...prev, [idx]: "" })))
        .finally(() => fetchingRef.current.delete(idx));
    },
    // visibleChapters is rebuilt each render; its length + book id capture the
    // identity we actually depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book?.id, canAccessAll, visibleChapters.length],
  );

  // Keep the rendered window's chapter bodies (and the immediate neighbors)
  // loaded — for paged flips and for scroll-mode continuous loading alike, so a
  // boundary always has real content to slide/scroll into.
  useEffect(() => {
    for (let idx = winStart; idx <= winEnd; idx++) ensureContent(idx);
    ensureContent(winStart - 1);
    ensureContent(winEnd + 1);
  }, [winStart, winEnd, ensureContent]);

  // Measure the paged viewport width (the exact page step).
  useEffect(() => {
    if (settings.scrollMode) return;
    const el = pageViewportRef.current;
    if (!el) return;
    const measure = () => setPageWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.scrollMode]);

  // Measure each windowed chapter's start page + page count from the laid-out
  // multicolumn flow (synchronously, before paint, so window changes never
  // flash). Drives the translate offset and resolves the one-shot restore /
  // backward-into-last-page landing.
  useLayoutEffect(() => {
    if (settings.scrollMode) return;
    const content = pageContentRef.current;
    if (!content || pageWidth <= 0) return;
    const contentLeft = content.getBoundingClientRect().left;
    const start: Record<number, number> = {};
    for (let idx = winStart; idx <= winEnd; idx++) {
      const el = chapterSectionRefs.current[idx];
      if (!el) continue;
      const x = el.getBoundingClientRect().left - contentLeft;
      start[idx] = Math.max(0, Math.round((x - pagedSidePadding) / pageWidth));
    }
    const total = Math.max(1, Math.round(content.scrollWidth / pageWidth));
    const pages: Record<number, number> = {};
    for (let idx = winStart; idx <= winEnd; idx++) {
      if (start[idx] === undefined) continue;
      const next = start[idx + 1];
      pages[idx] = Math.max(1, (next ?? total) - start[idx]);
    }
    setLayout({ start, pages, total });

    // Only settle the local page once the active chapter's real body is in.
    if (
      winContent[currentChapterIdx] === undefined ||
      pages[currentChapterIdx] === undefined
    )
      return;
    const cap = pages[currentChapterIdx] - 1;
    if (!pagedRestoredRef.current) {
      pagedRestoredRef.current = true;
      const saved = initialRef.current;
      const savedLocal =
        typeof saved.exact?.pageIndex === "number" ? saved.exact.pageIndex : 0;
      setLocalPage(Math.max(0, Math.min(savedLocal, cap)));
    } else if (pendingPrevLastRef.current) {
      pendingPrevLastRef.current = false;
      setLocalPage(cap);
    } else {
      setLocalPage((prev) => Math.min(prev, cap));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.scrollMode,
    winStart,
    winEnd,
    winContent,
    pageWidth,
    settings.fontSize,
    currentChapterIdx,
  ]);

  // Keep the rendered window centered on the active chapter (its two
  // neighbors), but only while idle so a flip animation is never cut short.
  // Prepend the previous chapter only once its body is loaded, so its later
  // layout can't shift the page being read.
  useEffect(() => {
    if (settings.scrollMode || pageAnimate) return;
    const last = visibleChapters.length - 1;
    if (last < 0) return;
    const wantEnd = Math.min(currentChapterIdx + 1, last);
    const prevIdx = Math.max(currentChapterIdx - 1, 0);
    const prevReady =
      prevIdx === currentChapterIdx || winContent[prevIdx] !== undefined;
    const wantStart = prevReady ? prevIdx : currentChapterIdx;
    if (wantStart !== winStart || wantEnd !== winEnd) {
      setWinStart(wantStart);
      setWinEnd(wantEnd);
    }
  }, [
    settings.scrollMode,
    pageAnimate,
    currentChapterIdx,
    winContent,
    winStart,
    winEnd,
    visibleChapters.length,
  ]);

  // Mirror the page-within-chapter into the header progress bar / saved percent.
  useEffect(() => {
    if (settings.scrollMode) return;
    const pages = layout.pages[currentChapterIdx] ?? 1;
    // A single-page chapter has nothing more to turn to, so it counts as fully
    // read; multi-page goes 0% (first page) → 100% (last page).
    setLocalScrollProgress(
      pages > 1 ? Math.round((localPage / (pages - 1)) * 100) : 100,
    );
  }, [localPage, layout, currentChapterIdx, settings.scrollMode]);

  // Scroll mode: when the window grows/shrinks (or a prepended/loaded chapter
  // above changes height), re-pin the scroll so the anchored chapter stays put —
  // prepending content above otherwise jumps the reader. Skipped during restore
  // so it doesn't fight the saved-position placement.
  useLayoutEffect(() => {
    if (!settings.scrollMode || suppressSaveRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const { idx, offset } = scrollAnchorRef.current;
    if (!chapterSectionRefs.current[idx]) return;
    el.scrollTop = sectionScrollTop(idx) + offset;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winStart, winEnd, winContent, settings.scrollMode]);

  // Re-enable the flip transition once it lands, then let the window-reconcile
  // effect (now idle) load/drop neighbors invisibly.
  const handlePageTransitionEnd = (e: React.TransitionEvent) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    setPageAnimate(false);
  };

  const handleForward = () => {
    if (settings.scrollMode) {
      if (containerRef.current) containerRef.current.scrollTop += 300;
      return;
    }
    const pages = layout.pages[currentChapterIdx] ?? 1;
    if (localPage < pages - 1) {
      setPageAnimate(true);
      setLocalPage((p) => p + 1);
    } else if (currentChapterIdx < visibleChapters.length - 1) {
      // The next chapter is preloaded to the right, so this is one continuous
      // page step — the view keeps sliding right instead of resetting left.
      setPageAnimate(true);
      setCurrentChapterIdx((c) => c + 1);
      setLocalPage(0);
    }
  };

  const handleBackward = () => {
    if (settings.scrollMode) {
      if (containerRef.current) containerRef.current.scrollTop -= 300;
      return;
    }
    if (localPage > 0) {
      setPageAnimate(true);
      setLocalPage((p) => p - 1);
    } else if (currentChapterIdx > 0) {
      const prev = currentChapterIdx - 1;
      const prevPages = layout.pages[prev];
      if (prevPages !== undefined) {
        // Previous chapter is loaded to the left → slide one page left into it.
        setPageAnimate(true);
        setCurrentChapterIdx(prev);
        setLocalPage(prevPages - 1);
      } else {
        // Not measured yet (rare: an immediate back-flip at session start).
        pendingPrevLastRef.current = true;
        setPageAnimate(false);
        setCurrentChapterIdx(prev);
        setLocalPage(0);
        ensureContent(prev);
      }
    }
  };

  // Jump to a chapter by explicit choice (header picker / chapter nav). Paged
  // mode re-anchors the window on it and opens its first page.
  const goToChapter = (idx: number) => {
    if (settings.scrollMode) {
      // Re-anchor the continuous feed on the chosen chapter, at its top.
      scrollAnchorRef.current = { idx, offset: 0 };
      ensureContent(idx);
      setCurrentChapterIdx(idx);
      setWinStart(idx);
      setWinEnd(idx);
      setLocalScrollProgress(0);
      if (containerRef.current) containerRef.current.scrollTop = 0;
      return;
    }
    setPageAnimate(false);
    pendingPrevLastRef.current = false;
    setCurrentChapterIdx(idx);
    setLocalPage(0);
    setWinStart(idx);
    setWinEnd(idx);
  };

  const touchStartYRef = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchStartRef.current - touchEnd;
    const diffY = Math.abs(touchStartYRef.current - touchEndY);
    // Only trigger on primarily horizontal swipes (ignore vertical scrolling)
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > diffY) {
      if (diffX > 0) handleForward();
      else handleBackward();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "p") handleForward();
      if (key === "o") handleBackward();
      // Block common screenshot and dev tools shortcuts
      if (
        (e.ctrlKey && (key === "p" || key === "s" || key === "u")) ||
        (e.metaKey && (key === "p" || key === "s" || key === "u")) ||
        (e.metaKey &&
          e.shiftKey &&
          (key === "3" || key === "4" || key === "5")) ||
        e.key === "PrintScreen" ||
        e.key === "F12" ||
        (e.ctrlKey &&
          e.shiftKey &&
          (key === "i" || key === "j" || key === "c")) ||
        (e.metaKey && e.altKey && (key === "i" || key === "j" || key === "c"))
      ) {
        e.preventDefault();
        return false;
      }
    };
    const preventDefault = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", preventDefault);
    document.addEventListener("copy", preventDefault);
    document.addEventListener("cut", preventDefault);
    document.addEventListener("selectstart", preventDefault);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", preventDefault);
      document.removeEventListener("copy", preventDefault);
      document.removeEventListener("cut", preventDefault);
      document.removeEventListener("selectstart", preventDefault);
    };
  }, [handleForward, handleBackward]);

  // Restore scroll position when component mounts
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const restoreScroll = () => {
      if (cancelled) return;

      if (settings.scrollMode && containerRef.current) {
        // The window opens on just the saved chapter, so anchor the saved
        // within-chapter offset to that section's top. computeScrollAnchor then
        // captures the live position for the seamless feed to take over.
        const savedIdx = initialRef.current.chapterIndex;
        const sEl = chapterSectionRefs.current[savedIdx];
        const savedOffset =
          typeof initialRef.current.exact?.scrollTopPx === "number"
            ? initialRef.current.exact.scrollTopPx
            : (initialRef.current.scrollProgress / 100) *
              (sEl?.offsetHeight ?? 0);
        const target = sectionScrollTop(savedIdx) + Math.max(0, savedOffset);
        containerRef.current.scrollTop = Math.min(
          Math.max(target, 0),
          Math.max(
            containerRef.current.scrollHeight -
              containerRef.current.clientHeight,
            0,
          ),
        );
        const anchor = computeScrollAnchor();
        if (anchor) scrollAnchorRef.current = anchor;
      }
      // Paged mode restores its page in the page-count effect (one-shot), so
      // this polling loop only drives the scroll-mode vertical position.

      attempts += 1;
      if (attempts < 10 && !cancelled) {
        setTimeout(restoreScroll, 120);
      } else {
        suppressSaveRef.current = false;
      }
    };

    const timer = setTimeout(restoreScroll, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Keep the latest onProgressUpdate in a ref so the sync effect below does not
  // depend on the callback's identity. The parent passes a fresh inline function
  // every render; including it in the dep array caused an infinite update loop
  // (effect -> setReadingChapterIndex in parent -> new callback -> effect -> ...),
  // which also forced repeated re-renders that lost the WebGL context.
  const onProgressUpdateRef = useRef(onProgressUpdate);
  onProgressUpdateRef.current = onProgressUpdate;

  // Sync progress back to main state when it changes significantly (save both scroll and chapter)
  useEffect(() => {
    if (suppressSaveRef.current) return;

    const exact: Partial<BookProgress> = {};
    if (settings.scrollMode && containerRef.current) {
      // Persist position WITHIN the active chapter so restore is stable even
      // though the continuous feed's absolute scrollTop spans many chapters.
      exact.scrollTopPx = scrollAnchorRef.current.offset;
      exact.scrollHeightPx =
        chapterSectionRefs.current[currentChapterIdx]?.offsetHeight ?? 0;
      exact.clientHeightPx = containerRef.current.clientHeight;
    } else if (!settings.scrollMode) {
      // Persist the page WITHIN the active chapter (pageIndex name kept for
      // backward-compatible restore) and that chapter's page count.
      exact.pageIndex = localPage;
      exact.pageCount = layout.pages[currentChapterIdx] ?? 1;
    }

    onProgressUpdateRef.current(
      localScrollProgress,
      currentChapterIdx,
      currentOrder,
      exact,
    );
  }, [localScrollProgress, currentChapterIdx, localPage]);

  // Mature gate (defense in depth): a reader who can't see mature content must
  // not open a mature book, even if it reached here via a stale selectedBook /
  // shared link / spotlight / search reveal. Enabling the toggle in Settings
  // lifts this.
  if (!canSeeMature && book?.isMature) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center px-10 text-center">
        <span className="material-icons-round text-gray-300 text-5xl mb-4">
          lock
        </span>
        <p className="text-sm font-bold text-gray-500 mb-2">
          This book contains mature content
        </p>
        <p className="text-[11px] text-gray-400 mb-4 max-w-xs">
          Turn on “Show mature content” in Settings to read it.
        </p>
        <button
          onClick={() => setView("settings")}
          className="text-xs font-bold uppercase tracking-widest text-accent"
        >
          Enable mature content in Settings
        </button>
        <button
          onClick={() => setView("explore")}
          className="mt-4 text-[11px] font-bold uppercase tracking-widest text-gray-300"
        >
          Back to Explore
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 animate-in fade-in duration-500 overflow-hidden flex flex-col ${
        settings.inverted ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      <header
        className={`p-6 flex justify-between items-center z-[100] ${
          settings.inverted ? "bg-black/80" : "bg-white/80"
        } backdrop-blur-md border-b ${
          settings.inverted ? "border-gray-800" : "border-gray-50"
        }`}
      >
        <button onClick={onBack} className="w-10 h-10 shrink-0 opacity-40">
          <span className="material-icons-round">close</span>
        </button>

        <div className="flex-1 px-4 flex flex-col items-center">
          <select
            value={currentChapterIdx}
            onChange={(e) => goToChapter(parseInt(e.target.value))}
            className={`text-[10px] font-bold uppercase tracking-widest bg-transparent outline-none border-b border-accent/40 pb-1 max-w-[200px] text-center cursor-pointer mb-2 ${
              settings.inverted ? "text-white" : "text-black"
            }`}
            disabled={!canAccessAll}
          >
            {visibleChapters.length > 0 ? (
              visibleChapters.map((ch: any, i: number) => (
                <option
                  key={i}
                  value={i}
                  className={
                    settings.inverted
                      ? "bg-gray-900 text-white"
                      : "bg-white text-black"
                  }
                >
                  {ch.title || `Chapter ${i + 1}`}
                  {isAuthor &&
                  !isChapterPublished(allMeta, ch.order, book?.chaptersCount)
                    ? " (Draft)"
                    : ""}
                </option>
              ))
            ) : (
              <option value={0}>{book?.title || "Story"}</option>
            )}
          </select>
          <div className="w-full max-w-[120px] h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${localScrollProgress}%` }}
            ></div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {book && (
            <button
              onClick={() => startReport("Book", book.id)}
              className="w-10 h-10 shrink-0 opacity-40"
              aria-label="Report this book"
            >
              <span className="material-icons-round">report</span>
            </button>
          )}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="w-10 h-10 shrink-0 opacity-40"
          >
            <span className="material-icons-round">settings</span>
          </button>
        </div>
      </header>
      {reportSheet}

      {showOptions && (
        <>
          {/* Tap-outside backdrop — closes the panel. Transparent so it doesn't
              dim the page; sits above the header so a tap on the gear also closes. */}
          <div
            className="fixed inset-0 z-[105]"
            onClick={() => setShowOptions(false)}
          />
          <div
            className={`fixed top-16 right-6 w-64 p-6 rounded-3xl shadow-2xl z-[110] border ${
              settings.inverted
                ? "bg-gray-900 border-gray-800 text-white"
                : "bg-white border-gray-100 text-black"
            }`}
          >
            <div className="space-y-6">
              <div>
                <p className="text-[9px] font-bold uppercase opacity-40 mb-3">
                  Font Size ({settings.fontSize}px)
                </p>
                <input
                  type="range"
                  min="10"
                  max="18"
                  value={settings.fontSize}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      fontSize: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-accent"
                />
              </div>
              <label className="flex justify-between items-center cursor-pointer">
                <p className="text-[10px] font-bold uppercase">Invert Colors</p>
                <input
                  type="checkbox"
                  checked={settings.inverted}
                  onChange={() =>
                    setSettings({ ...settings, inverted: !settings.inverted })
                  }
                  className="accent-accent"
                />
              </label>
              <label className="flex justify-between items-center cursor-pointer">
                <p className="text-[10px] font-bold uppercase">Scroll Mode</p>
                <input
                  type="checkbox"
                  checked={settings.scrollMode}
                  onChange={() =>
                    setSettings({
                      ...settings,
                      scrollMode: !settings.scrollMode,
                    })
                  }
                  className="accent-accent"
                />
              </label>
            </div>
          </div>
        </>
      )}
      {!settings.scrollMode && (
        <>
          {!atBookStart && (
            <button
              onClick={handleBackward}
              style={{ left: pagedArrowInset }}
              className={`fixed top-1/2 -translate-y-1/2 w-12 h-12 rounded-full backdrop-blur-md border flex items-center justify-center z-[150] active:scale-90 transition-all shadow-md opacity-80 hover:opacity-100 ${
                settings.inverted
                  ? "bg-white/20 border-white/40 text-white"
                  : "bg-white/60 border-white/80 text-black"
              }`}
              aria-label="Previous Page"
            >
              <span className="material-icons-round">chevron_left</span>
            </button>
          )}
          {!atBookEnd && (
            <button
              onClick={handleForward}
              style={{ right: pagedArrowInset }}
              className={`fixed top-1/2 -translate-y-1/2 w-12 h-12 rounded-full backdrop-blur-md border flex items-center justify-center z-[150] active:scale-90 transition-all shadow-md opacity-80 hover:opacity-100 ${
                settings.inverted
                  ? "bg-white/20 border-white/40 text-white"
                  : "bg-white/60 border-white/80 text-black"
              }`}
              aria-label="Next Page"
            >
              <span className="material-icons-round">chevron_right</span>
            </button>
          )}
        </>
      )}
      {settings.scrollMode ? (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto no-scrollbar p-8 pt-10"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div
            className={`max-w-2xl mx-auto min-h-full reader-content select-none ${
              isBlurred ? "blur-xl" : ""
            }`}
            style={{
              fontSize: `${settings.fontSize}px`,
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
          >
            {!canAccessAll && (
              <div className="p-4 mb-10 bg-accent/10 border border-accent/20 rounded-2xl text-center">
                <p className="text-[10px] font-bold text-accent uppercase tracking-[0.2em]">
                  Preview Mode
                </p>
                <p className="text-[8px] font-medium text-accent/60 uppercase mt-1">
                  Purchase the full work to unlock all chapters.
                </p>
              </div>
            )}
            {/* Continuous chapter feed: the windowed chapters render stacked, so
                scrolling flows seamlessly from one chapter into the next. */}
            {Array.from(
              { length: Math.max(0, winEnd - winStart + 1) },
              (_, k) => winStart + k,
            ).map((idx) => {
              const meta = visibleChapters[idx];
              if (!meta) return null;
              const body = winContent[idx];
              return (
                <section
                  key={idx}
                  ref={(el) => {
                    chapterSectionRefs.current[idx] = el;
                  }}
                  className="pb-16"
                >
                  <h1 className="text-3xl font-bold text-center mb-12 pt-4">
                    {meta.title || `Chapter ${idx + 1}`}
                  </h1>
                  <div className="leading-relaxed whitespace-pre-line text-justify">
                    {body === undefined ? (
                      <p className="text-center text-xs opacity-40 py-10 uppercase tracking-widest">
                        Loading…
                      </p>
                    ) : (
                      renderFormattedContent(body)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden relative">
          {!canAccessAll && (
            <div className="absolute top-4 left-4 right-4 p-4 bg-accent/10 border border-accent/20 rounded-2xl text-center z-20">
              <p className="text-[10px] font-bold text-accent uppercase tracking-[0.2em]">
                Preview Mode
              </p>
              <p className="text-[8px] font-medium text-accent/60 uppercase mt-1">
                Purchase the full work to unlock all chapters.
              </p>
            </div>
          )}
          <div
            ref={pageViewportRef}
            className="no-scrollbar h-full w-full overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              ref={pageContentRef}
              onTransitionEnd={handlePageTransitionEnd}
              className={`reader-content h-full py-14 pt-10 relative z-10 ${
                isBlurred ? "blur-xl" : ""
              }`}
              style={{
                fontSize: `${settings.fontSize}px`,
                ...(pageWidth > 0
                  ? {
                      columnWidth: `${pagedColWidth}px`,
                      columnGap: `${pagedColGap}px`,
                      columnFill: "auto" as const,
                      paddingLeft: `${pagedSidePadding}px`,
                      paddingRight: `${pagedSidePadding}px`,
                    }
                  : {}),
                transform: `translateX(${
                  -((layout.start[currentChapterIdx] ?? 0) + localPage) *
                  pageWidth
                }px)`,
                transition: pageAnimate ? "transform 0.35s ease" : "none",
                willChange: "transform",
              }}
            >
              {Array.from(
                { length: Math.max(0, winEnd - winStart + 1) },
                (_, k) => winStart + k,
              ).map((idx) => {
                const meta = visibleChapters[idx];
                if (!meta) return null;
                const body = winContent[idx];
                return (
                  <section
                    key={idx}
                    ref={(el) => {
                      chapterSectionRefs.current[idx] = el;
                    }}
                    // Each chapter starts on a fresh page so the continuous flow
                    // has clean per-chapter page boundaries.
                    style={
                      idx > winStart ? { breakBefore: "column" } : undefined
                    }
                  >
                    <h1 className="text-3xl font-bold mb-12 pt-10">
                      {meta.title || `Chapter ${idx + 1}`}
                    </h1>
                    <div className="leading-relaxed whitespace-pre-line text-justify">
                      {body === undefined ? (
                        <p className="text-center text-xs opacity-40 py-10 uppercase tracking-widest">
                          Loading…
                        </p>
                      ) : (
                        renderFormattedContent(body)
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto border-t border-gray-100 py-6 flex flex-col items-center">
        <div className="flex items-start gap-8">
          {(() => {
            const chapterLikeKey = `${book?.id}:${currentOrder}`;
            const chapterIsLiked = likedChapters?.has(chapterLikeKey) || false;
            const chapterLikesArr = Array.isArray(book?.likes)
              ? book.likes
              : [book?.likes || 0];
            const chapterLikesCount = chapterLikesArr[currentOrder] || 0;
            return (
              <button
                onClick={() => onLike(currentOrder)}
                className="flex flex-col items-center gap-1 transition-all active:scale-90"
              >
                <span
                  className={`material-icons-round text-2xl ${
                    chapterIsLiked ? "text-accent" : "text-gray-400"
                  }`}
                >
                  thumb_up
                </span>
                <span
                  className={`text-[9px] font-bold uppercase ${
                    chapterIsLiked ? "text-accent" : "text-gray-400"
                  }`}
                >
                  Like
                </span>
                <span
                  className={`text-[9px] font-bold ${
                    chapterIsLiked ? "text-accent" : "text-gray-400"
                  }`}
                >
                  {chapterLikesCount}
                </span>
              </button>
            );
          })()}
          <button
            onClick={() => onComments(currentOrder)}
            className="flex flex-col items-center gap-1 transition-all active:scale-90"
          >
            <span className="material-icons-round text-2xl text-gray-400">
              chat_bubble
            </span>
            <span className="text-[9px] font-bold uppercase text-gray-400">
              Comment
            </span>
            <span className="text-[9px] font-bold text-gray-400">
              {chapterCommentsCount || 0}
            </span>
          </button>
          <button
            onClick={onShare}
            className="flex flex-col items-center gap-1 transition-all active:scale-90"
          >
            <span className="material-icons-round text-2xl text-gray-400">
              share
            </span>
            <span className="text-[9px] font-bold uppercase text-gray-400">
              Share
            </span>
          </button>
          {canSave && (
            <button
              onClick={onSave}
              className="flex flex-col items-center gap-1 transition-all active:scale-90"
            >
              <span
                className={`material-icons-round text-2xl ${
                  isSaved ? "text-accent" : "text-gray-400"
                }`}
              >
                {isSaved ? "bookmark" : "bookmark_border"}
              </span>
              <span
                className={`text-[9px] font-bold uppercase ${
                  isSaved ? "text-accent" : "text-gray-400"
                }`}
              >
                Save
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
