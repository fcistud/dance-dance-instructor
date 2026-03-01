document.addEventListener("DOMContentLoaded", () => {
  const stack = document.getElementById("landingVideoStack");
  if (!stack) {
    return;
  }

  const videos = stack.querySelectorAll(".layer");
  const green = stack.querySelector(".layer-green");
  const red = stack.querySelector(".layer-red");
  const blue = stack.querySelector(".layer-blue");

  if (!videos.length || !green || !red || !blue) {
    return;
  }

  const offsetBetweenStart = 0.07;
  const maxOffset = 120;
  let loaded = 0;
  let centerX = stack.getBoundingClientRect().left + stack.clientWidth / 2;
  let target = 0;
  let current = 0;

  const syncVideos = () => {
    videos.forEach((video, index) => {
      video.currentTime = index * offsetBetweenStart;
    });
  };

  videos.forEach((video) => {
    video.addEventListener("loadeddata", () => {
      loaded += 1;
      if (loaded !== videos.length) {
        return;
      }

      videos.forEach((v) => {
        v.currentTime = 0;
      });

      requestAnimationFrame(() => {
        videos.forEach((v, index) => {
          v.pause();
          const delay = index * offsetBetweenStart;
          setTimeout(() => {
            v.play().catch(() => {});
          }, delay * 1000);
        });
      });
    });
  });

  const updateCenter = () => {
    const rect = stack.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
  };

  window.addEventListener("resize", updateCenter);

  function animate() {
    current += (target - current) * 0.1;
    red.style.transform = `translateX(${current * maxOffset}px)`;
    green.style.transform = `translateX(${current * maxOffset * 0.6}px)`;
    blue.style.transform = `translateX(${current * maxOffset * 0.4}px)`;
    requestAnimationFrame(animate);
  }

  function resetTarget(snap = false) {
    target = 0;
    if (snap) {
      current = 0;
    }
    syncVideos();
  }

  animate();

  window.addEventListener("mousemove", (event) => {
    const rect = stack.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }
    const dx = event.clientX - centerX;
    const half = Math.max(1, rect.width / 2);
    target = Math.max(-1, Math.min(1, dx / half));
  });

  stack.addEventListener("mouseleave", () => resetTarget());
  window.addEventListener("blur", () => resetTarget());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      resetTarget();
    }
  });
  window.addEventListener("touchend", () => resetTarget());
  window.addEventListener("touchcancel", () => resetTarget());

  updateCenter();
});
