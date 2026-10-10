import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, Radio } from 'lucide-react';

const chapters = [
  { eyebrow: '01 / THE PHONE YOU KNOW', line1: 'Your iPhone.', line2: 'Reimagined.', description: 'Everything you love. With somewhere new to go.' },
  { eyebrow: '02 / MEET ITS OTHER HALF', line1: 'Small addition.', line2: 'Big possibility.', description: 'A slim radio pouch. A connection beyond cellular coverage.' },
  { eyebrow: '03 / GO BEYOND THE BARS', line1: 'Off the grid.', line2: 'Still together.', description: 'Text. Voice. A glimpse of where you are. Keep the connection.' },
];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const segment = (p: number, start: number, end: number) => clamp((p - start) / (end - start));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** A reversible three-act sequence. No wheel interception, timers, or per-frame React renders. */
export function HardwareReveal() {
  const section = useRef<HTMLElement>(null);
  const [chapter, setChapter] = useState(0);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let previousChapter = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const stickyHeight = (element.firstElementChild as HTMLElement).offsetHeight;
      const p = reducedMotion.matches ? 1 : clamp((72 - rect.top) / Math.max(1, rect.height - stickyHeight));
      const entrance = smooth(segment(p, .03, .25));
      const join = smooth(segment(p, .36, .73));
      const finish = smooth(segment(p, .74, .96));
      const sweep = segment(p, .66, .89);
      const values = {
        '--progress': p,
        '--entrance': entrance,
        '--join': join,
        '--finish': finish,
        '--pouch-opacity': smooth(segment(p, .08, .23)),
        '--sweep': sweep,
        '--sweep-opacity': reducedMotion.matches ? 0 : Math.sin(sweep * Math.PI) * .38,
        '--ring-one': segment(p, .70, .90),
        '--ring-two': segment(p, .75, .96),
        '--ring-three': segment(p, .80, 1),
      };
      for (const [key, value] of Object.entries(values)) element.style.setProperty(key, value.toFixed(4));
      const nextChapter = p < .26 ? 0 : p < .73 ? 1 : 2;
      if (nextChapter !== previousChapter) { previousChapter = nextChapter; setChapter(nextChapter); }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    reducedMotion.addEventListener('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      reducedMotion.removeEventListener('change', schedule);
    };
  }, []);

  return (
    <section ref={section} id="hardware" className="hardware-reveal" data-chapter={chapter} aria-label="Meet the Chrp pouch">
      <div className="hardware-sticky">
        <div className="cinema-ambient" aria-hidden="true" />
        <div className="cinema-grain" aria-hidden="true" />
        <div className="cinema-backdrop-word" aria-hidden="true">Beyond.</div>
        <div className="hardware-layout">
          <div className="hardware-copy">
            <div className="cinema-chapters">
              {chapters.map((item, index) => (
                <div key={item.eyebrow} className={`cinema-chapter ${index === chapter ? 'is-current' : ''}`} aria-hidden={index !== chapter}>
                  <p className="hardware-eyebrow">{item.eyebrow}</p>
                  <h2>{item.line1}<br /><span>{item.line2}</span></h2>
                  <p className="hardware-description">{item.description}</p>
                </div>
              ))}
            </div>
            <a className="hardware-skip" href="#simulator"><span>Experience the connection</span><ArrowUpRight size={16} /></a>
            <div className="cinema-chapter-index" aria-hidden="true">{chapters.map((_, i) => <span key={i} className={i === chapter ? 'is-current' : ''}>0{i + 1}</span>)}</div>
          </div>

          <div className="hardware-art" role="img" aria-label="Your supplied iPhone and Chrp pouch images float apart, align, and attach as you scroll. A light sweep and expanding signal rings reveal the completed hardware concept.">
            <div className="cinema-signal-field" aria-hidden="true"><i /><i /><i /></div>
            <div className="hardware-scale">
              <div className="hardware-assembly">
                <div className="cinema-phone">
                  <div className="cinema-phone-surface"><img src="/hardware/iphone-back.png" width="1024" height="1536" alt="" draggable={false} fetchPriority="high" /><span className="cinema-sheen" /></div>
                </div>
                <div className="cinema-alignment" aria-hidden="true"><span /><span /><span /></div>
                <div className="cinema-pouch">
                  <div className="cinema-pouch-surface"><img src="/hardware/chrp-pouch-front.png" width="1024" height="1536" alt="" draggable={false} fetchPriority="high" /><span className="cinema-sheen" /></div>
                </div>
                <div className="cinema-led" aria-hidden="true" />
              </div>
              <div className="hardware-floor-shadow" />
            </div>
            <div className="cinema-device-label cinema-phone-label" aria-hidden="true"><span>Your iPhone</span><i /></div>
            <div className="cinema-device-label cinema-pouch-label" aria-hidden="true"><i /><span>Chrp pouch</span></div>
            <div className={`hardware-connection ${chapter === 2 ? 'is-attached' : ''}`}>
              <span className="hardware-connection-dot">{chapter === 2 ? <Check size={10} strokeWidth={3} /> : <Radio size={11} />}</span>
              <span>{chapter === 2 ? 'A whole new connection.' : chapter === 1 ? 'Made to come together.' : 'The familiar. With a little more.'}</span>
            </div>
          </div>
        </div>
        <div className="hardware-bottom">
          <span className="hardware-scroll-cue"><ArrowDown size={14} /> {chapter === 2 ? 'Keep going. Try it live.' : 'Scroll to bring them together'}</span>
          <div className="hardware-progress" aria-hidden="true"><span /></div>
          <span className="hardware-concept">CHRP · HARDWARE CONCEPT</span>
        </div>
      </div>
    </section>
  );
}
