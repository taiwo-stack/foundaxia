import React from 'react';

// Country flags drawn as SVG: emoji flags show as plain letters on Windows.

export const FlagUK = (props) => (
  <svg viewBox="0 0 60 30" preserveAspectRatio="none" {...props}>
    <clipPath id="flag-uk-s"><path d="M0,0 v30 h60 v-30 z" /></clipPath>
    <clipPath id="flag-uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
    <g clipPath="url(#flag-uk-s)">
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag-uk-t)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </g>
  </svg>
);

export const FlagUS = (props) => {
  const stripe = 100 / 13;
  return (
    <svg viewBox="0 0 190 100" preserveAspectRatio="none" {...props}>
      <rect width="190" height="100" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11].map(i => <rect key={i} y={i * stripe} width="190" height={stripe} fill="#fff" />)}
      <rect width="76" height={stripe * 7} fill="#3C3B6E" />
      {Array.from({ length: 5 }, (_, r) => Array.from({ length: 6 }, (_, c) => (
        <circle key={`${r}-${c}`} cx={7 + c * 12.4} cy={6 + r * 10.4} r="2.2" fill="#fff" />
      )))}
    </svg>
  );
};

export const FlagCA = (props) => (
  <svg viewBox="0 0 9600 4800" preserveAspectRatio="none" {...props}>
    <rect width="9600" height="4800" fill="#D52B1E" />
    <path fill="#fff" d="m2400 0h4800v4800h-4800zm2490 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z" />
  </svg>
);

export const FlagNG = (props) => (
  <svg viewBox="0 0 3 2" preserveAspectRatio="none" {...props}>
    <rect width="3" height="2" fill="#008751" />
    <rect x="1" width="1" height="2" fill="#fff" />
  </svg>
);

// A simple globe for "International schools".
export const FlagWorld = (props) => (
  <svg viewBox="0 0 60 40" preserveAspectRatio="none" {...props}>
    <rect width="60" height="40" fill="#12397A" />
    <g fill="none" stroke="#F27A24" strokeWidth="2">
      <circle cx="30" cy="20" r="14" />
      <ellipse cx="30" cy="20" rx="6" ry="14" />
      <path d="M16 20 H44 M18.5 13 H41.5 M18.5 27 H41.5" />
    </g>
  </svg>
);

export const FLAGS = { uk: FlagUK, us: FlagUS, ca: FlagCA, ng: FlagNG, intl: FlagWorld };
