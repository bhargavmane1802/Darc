import React, { useState } from 'react';

export default function Avatar({
  src,
  alt = 'Avatar',
  fallback = '?',
  className = '',
  imgClassName = '',
  as: Component = 'div',
}) {
  const [hasError, setHasError] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setHasError(false);
  }

  const showImage = Boolean(src) && !hasError;

  return (
    <Component className={className}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          className={imgClassName}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      ) : (
        fallback
      )}
    </Component>
  );
}
