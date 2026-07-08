// VideoEmbed — the ONE controlled place /blog emits a video. Server component.
//
// It never trusts the stored embedUrl blindly: it re-derives a safe URL from
// the stored {provider, id} and only renders an <iframe> when that URL is on
// the exact host the CSP frame-src allows (youtube-nocookie / player.vimeo).
// Direct files must be https .mp4/.webm and render in a sandboxless <video>.
// Anything else renders as a plain link — never an arbitrary iframe.
const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^[0-9]{6,12}$/;

export default function VideoEmbed({ video }) {
  if (!video || typeof video !== 'object') return null;
  const { provider, id, url } = video;

  if (provider === 'youtube' && typeof id === 'string' && YT_ID.test(id)) {
    return (
      <div className="embed">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title="YouTube video"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allowFullScreen
        />
      </div>
    );
  }

  if (provider === 'vimeo' && typeof id === 'string' && VIMEO_ID.test(id)) {
    return (
      <div className="embed">
        <iframe
          src={`https://player.vimeo.com/video/${id}`}
          title="Vimeo video"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; fullscreen; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allowFullScreen
        />
      </div>
    );
  }

  if (provider === 'direct' && typeof url === 'string' && /^https:\/\/\S+\.(mp4|webm)(?:$|[?#])/i.test(url)) {
    return (
      <div className="embed">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} controls preload="metadata" playsInline />
      </div>
    );
  }

  // Unknown/unsafe — degrade to a link, never an arbitrary frame.
  if (typeof url === 'string' && /^https:\/\//i.test(url)) {
    return <p className="body"><a href={url} rel="nofollow noopener noreferrer" target="_blank">Watch video ↗</a></p>;
  }
  return null;
}
