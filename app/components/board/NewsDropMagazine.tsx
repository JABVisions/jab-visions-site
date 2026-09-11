"use client";

import React from "react";

function sourceFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "NEWS";
  }
}

export default function NewsDropMagazine({
  url,
  headline,
  images = [],
  source,
  description,
}: {
  url: string;
  headline: string;
  images?: string[];
  source?: string;
  description?: string;
}) {
  const pictures = Array.from(new Set(images.filter(Boolean))).slice(0, 4);

  return (
    <a className="newsMagazine" href={url} target="_blank" rel="noreferrer" aria-label={`Open news article: ${headline}`}>
      <div className="newsMasthead">
        <span>NEWS DROP</span>
        <span className="newsSource">{source || sourceFromUrl(url)}</span>
      </div>
      <div className="newsHeadline">{headline}</div>
      {pictures.length ? (
        <div className={`newsPictures count${Math.min(pictures.length, 4)}`}>
          {pictures.map((picture, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${picture}_${index}`} src={picture} alt="" loading="lazy" />
          ))}
        </div>
      ) : (
        <div className="newsPictureFallback" aria-hidden>JAB NEWS</div>
      )}
      {description ? <p>{description}</p> : null}
      <div className="newsFooter"><span>READ ARTICLE</span><span>OPEN →</span></div>

      <style jsx>{`
        .newsMagazine { display: block; overflow: hidden; border: 1px solid rgba(255,255,255,.16); border-radius: 22px; background: #080b10; color: white; text-decoration: none; box-shadow: 0 20px 55px rgba(0,0,0,.28); }
        .newsMasthead { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.13); background: rgba(255,255,255,.055); font-size: 10px; font-weight: 900; letter-spacing: .19em; }
        .newsSource { max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(196,241,255,.72); text-align: right; }
        .newsHeadline { padding: 16px 15px 15px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(22px,5vw,35px); font-weight: 800; line-height: .98; letter-spacing: -.025em; text-wrap: balance; }
        .newsPictures { display: grid; height: clamp(190px,42vw,330px); gap: 3px; overflow: hidden; background: #131820; }
        .newsPictures img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; object-fit: cover; }
        .newsPictures.count2 { grid-template-columns: 1.35fr 1fr; }
        .newsPictures.count3 { grid-template-columns: 1.45fr 1fr; grid-template-rows: 1fr 1fr; }
        .newsPictures.count4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        .newsPictures.count3 img:first-child { grid-row: 1 / 3; }
        .newsPictureFallback { display: grid; min-height: 180px; place-items: center; background: radial-gradient(circle at 20% 20%,rgba(0,220,255,.18),transparent 40%),radial-gradient(circle at 80% 70%,rgba(255,40,190,.16),transparent 45%),#0a0f16; color: rgba(255,255,255,.26); font-size: 13px; font-weight: 900; letter-spacing: .35em; }
        p { margin: 0; padding: 13px 15px 4px; color: rgba(238,246,250,.64); font-size: 12px; line-height: 1.5; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .newsFooter { display: flex; justify-content: space-between; gap: 12px; padding: 13px 15px; color: rgba(196,241,255,.76); font-size: 9px; font-weight: 900; letter-spacing: .16em; }
        @media (max-width: 520px) { .newsHeadline { font-size: 23px; } .newsPictures { height: 210px; } }
      `}</style>
    </a>
  );
}
