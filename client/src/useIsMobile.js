import { useEffect, useState } from 'react';

export default function useIsMobile(breakpoint) {
  const bp = breakpoint || 900;
  const [mobile, setMobile] = useState(function () {
    return typeof window !== 'undefined' && window.innerWidth <= bp;
  });
  useEffect(function () {
    const mq = window.matchMedia('(max-width: ' + bp + 'px)');
    const fn = function () { setMobile(mq.matches); };
    fn();
    mq.addEventListener('change', fn);
    return function () { mq.removeEventListener('change', fn); };
  }, [bp]);
  return mobile;
}
