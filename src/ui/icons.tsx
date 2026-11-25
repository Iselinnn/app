/** Тонкие линейные иконки, 1.5 px, свои SVG. */
import type { ComponentChildren } from 'preact';

function Svg({ children }: { children: ComponentChildren }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const IconArrow = () => (
  <Svg>
    <path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5" />
  </Svg>
);
export const IconClose = () => (
  <Svg>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Svg>
);
export const IconTrash = () => (
  <Svg>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7M10 10.5v6M14 10.5v6" />
  </Svg>
);
export const IconShare = () => (
  <Svg>
    <path d="M12 15V4M8 8l4-4 4 4M5 13v6.5h14V13" />
  </Svg>
);
export const IconImport = () => (
  <Svg>
    <path d="M12 4v11M8 11l4 4 4-4M5 13v6.5h14V13" />
  </Svg>
);
export const IconPlus = () => (
  <Svg>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
);
export const IconMinus = () => (
  <Svg>
    <path d="M5.5 12h13" />
  </Svg>
);
export const IconBackspace = () => (
  <Svg>
    <path d="M8.5 5h11A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11L3 12l5.5-7Z" />
    <path d="M11 9.5l5 5M16 9.5l-5 5" />
  </Svg>
);
export const IconCheck = () => (
  <Svg>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
