import type { Departure } from '../types';
import { SNCF_TER_COLOR } from '../utils/lineColors';
import { TheoreticalPill } from './TheoreticalPill';

const KIND_STYLES: Record<string, { label: string; background: string }> = {
  TER: { label: 'TER', background: SNCF_TER_COLOR },
  TGV: { label: 'TGV', background: '#9B2743' },
  IC: { label: 'IC', background: '#1F3A93' },
  LEX: { label: 'LEX', background: '#C8102E' },
  OUIGO: { label: 'OUIGO', background: '#E3006A' },
};

function OuigoLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 230.88875 230.86626" className={className} aria-hidden="true">
      <g transform="translate(-252.5595,-714.3074) matrix(1.25,0,0,-1.25,2.953125,1058.5434)">
        <path transform="translate(383.5961,183.0498)" fill="#e3006a" d="m 0,0 c 0,-50.582 -40.979,-91.554 -91.548,-91.554 -50.59,0 -91.563,40.972 -91.563,91.554 0,50.518 40.973,91.539 91.563,91.539 C -40.979,91.539 0,50.518 0,0" />
        <g fill="#ffffff">
          <path transform="translate(250.5055,179.1495)" d="m 0,0 0,16.799 c 0,2.19 1.729,3.934 3.932,3.934 2.191,0 3.936,-1.744 3.936,-3.934 l 0,-16.585 c 0,-5.83 2.906,-8.839 7.705,-8.839 4.801,0 7.711,2.904 7.711,8.559 l 0,16.865 c 0,2.19 1.734,3.934 3.928,3.934 2.202,0 3.932,-1.744 3.932,-3.934 l 0,-16.551 c 0,-10.821 -6.07,-16.123 -15.676,-16.123 C 5.879,-15.875 0,-10.528 0,0" />
          <path transform="translate(286.9556,195.9439)" d="M 0,0 C 0,2.2 1.744,3.938 3.938,3.938 6.136,3.938 7.874,2.2 7.874,0 l 0,-28.49 c 0,-2.2 -1.738,-3.938 -3.936,-3.938 C 1.744,-32.428 0,-30.69 0,-28.49 L 0,0 z" />
          <path transform="translate(295.6633,209.2582)" d="m 0,0 c 0,-2.633 -2.138,-4.771 -4.771,-4.771 -2.632,0 -4.764,2.138 -4.764,4.771 0,2.635 2.132,4.766 4.764,4.766 C -2.138,4.766 0,2.635 0,0" />
          <path transform="translate(330.6357,184.4189)" d="m 0,0 -9.197,0 c -1.89,0 -3.418,-1.541 -3.418,-3.429 0,-1.892 1.528,-3.367 3.418,-3.367 l 5.747,0 0,-4.89 c -1.817,-1.685 -4.401,-2.363 -8.065,-2.363 -6.322,0 -11.123,4.852 -11.123,11.38 0,6.085 4.85,11.194 10.567,11.194 3.375,0 5.667,-0.923 7.82,-2.451 0.561,-0.406 1.267,-0.809 2.395,-0.809 2.149,0 3.885,1.734 3.885,3.878 0,1.522 -0.873,2.601 -1.633,3.162 -3.223,2.251 -6.8,3.471 -12.206,3.471 -10.828,0 -19.053,-8.379 -19.053,-18.541 0,-10.563 7.97,-18.433 19.108,-18.433 5.531,0 10.201,1.687 13.591,4.326 1.743,1.335 2.106,2.391 2.106,4.696 l 0,8.251 C 3.942,-1.747 2.2,0 0,0" />
          <path transform="translate(355.9935,170.4649)" d="m 0,0 c -6.333,0 -10.819,5.154 -10.819,11.288 0,6.128 4.392,11.183 10.725,11.183 6.335,0 10.826,-5.154 10.826,-11.29 C 10.732,5.062 6.331,0 0,0 m 0,29.714 c -11.027,0 -19.047,-8.371 -19.047,-18.533 0,-10.16 7.919,-18.43 18.953,-18.43 11.02,0 19.04,8.373 19.04,18.537 0,10.16 -7.911,18.426 -18.946,18.426" />
          <path transform="translate(228.1901,170.4649)" d="m 0,0 c -6.34,0 -10.826,5.154 -10.826,11.288 0,6.128 4.388,11.183 10.725,11.183 6.331,0 10.822,-5.154 10.822,-11.29 C 10.721,5.062 6.325,0 0,0 m 0,29.714 c -11.033,0 -19.055,-8.371 -19.055,-18.533 0,-10.16 7.917,-18.43 18.954,-18.43 11.027,0 19.041,8.373 19.041,18.537 0,10.16 -7.915,18.426 -18.94,18.426" />
        </g>
      </g>
    </svg>
  );
}

export function TrainPill({ number, kind, language }: { number: string; kind?: string; language: 'fr' | 'en' }) {
  const style = KIND_STYLES[kind ?? ''] ?? { label: kind || 'Train', background: '#475569' };
  const title = language === 'fr' ? `${style.label} n° ${number}` : `${style.label} no. ${number}`;
  if (kind === 'OUIGO') {
    return (
      <span
        className="inline-flex flex-shrink-0 items-center gap-1 rounded-full py-px pl-px pr-1.5 text-[0.625rem] font-bold leading-none tracking-[0.04em] text-white"
        style={{ backgroundColor: style.background }}
        title={title}
      >
        <OuigoLogo className="h-3.5 w-3.5" />
        {number}
      </span>
    );
  }
  return (
    <span
      className="inline-flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] font-bold uppercase leading-none tracking-[0.06em] text-white"
      style={{ backgroundColor: style.background }}
      title={title}
    >
      <span>{style.label}</span>
      <span className="font-semibold opacity-90">{number}</span>
    </span>
  );
}

export function DepartureTags({ departure, language }: { departure: Departure; language: 'fr' | 'en' }) {
  return (
    <>
      {departure.train && <TrainPill number={departure.train} kind={departure.trainKind} language={language} />}
      {departure.theoretical && <TheoreticalPill language={language} />}
    </>
  );
}
