(function () {
    const waveGroup = document.getElementById('preloaderWaveGroup');
    const percentLabel = document.getElementById('preloaderPercent');
    const preloader = document.getElementById('preloader');

    const setProgress = (p) => {
        const clamped = Math.max(0, Math.min(100, p));
        const offsetY = 200 - (clamped / 100) * 200;
        waveGroup.setAttribute('transform', `translate(0, ${offsetY})`);
        const milestone = clamped >= 100 ? 100 : (clamped >= 50 ? 50 : 0);
        percentLabel.textContent = milestone + '%';
    };

    setProgress(0);
    document.body.style.overflow = 'hidden';

    let pausedAtHalf = false;

    const trackImages = () => {
        const realImgs = Array.from(document.images).filter(img => img.loading !== 'lazy');
        const total = realImgs.length || 1;
        let loaded = 0;

        const onOneLoaded = () => {
            loaded++;
            const target = (loaded / total) * 90;

            if (!pausedAtHalf && target >= 50) {
                pausedAtHalf = true;
                setProgress(50);
                setTimeout(() => setProgress(target), 700);
            } else {
                setProgress(target);
            }
        };

        realImgs.forEach(img => {
            if (img.complete) {
                onOneLoaded();
            } else {
                img.addEventListener('load', onOneLoaded, { once: true });
                img.addEventListener('error', onOneLoaded, { once: true });
            }
        });

        if (realImgs.length === 0) {
            setProgress(50);
            setTimeout(() => setProgress(60), 700);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', trackImages);
    } else {
        trackImages();
    }

    const startTime = Date.now();
    const minDisplayTime = 3200;
    const waveRiseTime = 2200;

    const finish = () => {
        const elapsed = Date.now() - startTime;
        const wait = Math.max(0, minDisplayTime - elapsed);
        setTimeout(() => {
            setProgress(100);
            setTimeout(() => {
                preloader.classList.add('is-hidden');
                document.body.style.overflow = '';
                setTimeout(() => preloader.remove(), 700);
            }, waveRiseTime + 200);
        }, wait);
    };

    window.addEventListener('load', finish);
    setTimeout(finish, 8000);
})();
