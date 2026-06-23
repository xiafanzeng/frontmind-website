document.documentElement.classList.remove('no-js');

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealTargets = document.querySelectorAll('.reveal, .animate-fade-up, .animate-stagger, .animate-hero-scale');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible', 'visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealTargets.forEach((target) => observer.observe(target));
  } else {
    revealTargets.forEach((target) => target.classList.add('is-visible', 'visible'));
  }
} else {
  document.querySelectorAll('.reveal, .animate-fade-up, .animate-stagger, .animate-hero-scale').forEach((target) => {
    target.classList.add('is-visible', 'visible');
  });
}
