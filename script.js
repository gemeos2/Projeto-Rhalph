/* =========================================================
   LIGHT RAYS (WebGL puro — sem dependências externas)
   ========================================================= */

const hexToRgb = hex => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
};

const getAnchorAndDir = (origin, w, h) => {
    const outside = 0.2;
    switch (origin) {
        case 'top-left':      return { anchor: [0, -outside * h],          dir: [0, 1] };
        case 'top-right':     return { anchor: [w, -outside * h],          dir: [0, 1] };
        case 'left':          return { anchor: [-outside * w, 0.5 * h],    dir: [1, 0] };
        case 'right':         return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] };
        case 'bottom-left':   return { anchor: [0, (1 + outside) * h],     dir: [0, -1] };
        case 'bottom-center': return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] };
        case 'bottom-right':  return { anchor: [w, (1 + outside) * h],     dir: [0, -1] };
        default:              return { anchor: [0.5 * w, -outside * h],    dir: [0, 1] };
    }
};

class LightRays {
    constructor(container, options = {}) {
        this.container = container;
        this.options = Object.assign({
            raysOrigin: 'top-center',
            raysColor: '#DE2427',
            raysSpeed: 1.5,
            lightSpread: 0.8,
            rayLength: 1.2,
            pulsating: false,
            fadeDistance: 0.9,
            saturation: 1.0,
            followMouse: true,
            mouseInfluence: 0.1,
            noiseAmount: 0.1,
            distortion: 0.05
        }, options);

        this.mouse = { x: 0.5, y: 0.5 };
        this.smoothMouse = { x: 0.5, y: 0.5 };
        this.animationId = null;
        this.uniforms = {};

        setTimeout(() => this.init(), 10);
    }

    init() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;';
        this.container.appendChild(canvas);

        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return;
        this.gl = gl;

        const vert = `
            attribute vec2 a_position;
            void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
        `;

        const frag = `precision highp float;
            uniform float iTime;
            uniform vec2  iResolution;
            uniform vec2  rayPos;
            uniform vec2  rayDir;
            uniform vec3  raysColor;
            uniform float raysSpeed;
            uniform float lightSpread;
            uniform float rayLength;
            uniform float pulsating;
            uniform float fadeDistance;
            uniform float saturation;
            uniform vec2  mousePos;
            uniform float mouseInfluence;
            uniform float noiseAmount;
            uniform float distortion;

            float noise(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord, float seedA, float seedB, float speed) {
                vec2 sourceToCoord = coord - raySource;
                vec2 dirNorm = normalize(sourceToCoord);
                float cosAngle = dot(dirNorm, rayRefDirection);
                float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
                float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
                float dist = length(sourceToCoord);
                float maxDist = iResolution.x * rayLength;
                float lengthFalloff = clamp((maxDist - dist) / maxDist, 0.0, 1.0);
                float fadeFalloff = clamp((iResolution.x * fadeDistance - dist) / (iResolution.x * fadeDistance), 0.5, 1.0);
                float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;
                float baseStrength = clamp(
                    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
                    (0.3  + 0.2  * cos(-distortedAngle * seedB + iTime * speed)),
                    0.0, 1.0);
                return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
            }

            void main() {
                vec2 coord = vec2(gl_FragCoord.x, iResolution.y - gl_FragCoord.y);
                vec2 finalRayDir = rayDir;
                if (mouseInfluence > 0.0) {
                    vec2 mouseScreenPos = mousePos * iResolution.xy;
                    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
                    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
                }
                vec4 rays1 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
                vec4 rays2 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234, 1.1 * raysSpeed);
                vec4 fragColor = rays1 * 0.5 + rays2 * 0.4;
                if (noiseAmount > 0.0) {
                    float n = noise(coord * 0.01 + iTime * 0.1);
                    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
                }
                float brightness = 1.0 - (coord.y / iResolution.y);
                fragColor.x *= 0.1 + brightness * 0.8;
                fragColor.y *= 0.3 + brightness * 0.6;
                fragColor.z *= 0.5 + brightness * 0.5;
                if (saturation != 1.0) {
                    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
                    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
                }
                fragColor.rgb *= raysColor;
                gl_FragColor = fragColor;
            }
        `;

        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return s;
        };

        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
        gl.linkProgram(prog);
        gl.useProgram(prog);
        this.prog = prog;

        // Full-screen triangle
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        // Cache uniform locations
        const uNames = ['iTime','iResolution','rayPos','rayDir','raysColor','raysSpeed',
                        'lightSpread','rayLength','pulsating','fadeDistance','saturation',
                        'mousePos','mouseInfluence','noiseAmount','distortion'];
        this.uloc = {};
        uNames.forEach(n => { this.uloc[n] = gl.getUniformLocation(prog, n); });

        // Set static uniforms
        const c = hexToRgb(this.options.raysColor);
        gl.uniform3f(this.uloc.raysColor, c[0], c[1], c[2]);
        gl.uniform1f(this.uloc.raysSpeed,       this.options.raysSpeed);
        gl.uniform1f(this.uloc.lightSpread,      this.options.lightSpread);
        gl.uniform1f(this.uloc.rayLength,        this.options.rayLength);
        gl.uniform1f(this.uloc.pulsating,        this.options.pulsating ? 1.0 : 0.0);
        gl.uniform1f(this.uloc.fadeDistance,     this.options.fadeDistance);
        gl.uniform1f(this.uloc.saturation,       this.options.saturation);
        gl.uniform1f(this.uloc.mouseInfluence,   this.options.mouseInfluence);
        gl.uniform1f(this.uloc.noiseAmount,      this.options.noiseAmount);
        gl.uniform1f(this.uloc.distortion,       this.options.distortion);

        this.canvas = canvas;
        this.updatePlacement();
        window.addEventListener('resize', () => this.updatePlacement());

        if (this.options.followMouse) {
            window.addEventListener('mousemove', (e) => {
                const rect = this.container.getBoundingClientRect();
                this.mouse.x = (e.clientX - rect.left) / rect.width;
                this.mouse.y = (e.clientY - rect.top) / rect.height;
            });
        }

        this.loop = this.loop.bind(this);
        this.animationId = requestAnimationFrame(this.loop);
    }

    updatePlacement() {
        if (!this.gl) return;
        const dpr = Math.min(window.devicePixelRatio, 2);
        const wCSS = this.container.clientWidth;
        const hCSS = this.container.clientHeight;
        const w = Math.round(wCSS * dpr);
        const h = Math.round(hCSS * dpr);
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
        this.gl.uniform2f(this.uloc.iResolution, w, h);
        const { anchor, dir } = getAnchorAndDir(this.options.raysOrigin, w, h);
        this.gl.uniform2f(this.uloc.rayPos, anchor[0], anchor[1]);
        this.gl.uniform2f(this.uloc.rayDir, dir[0], dir[1]);
    }

    loop(t) {
        if (!this.gl) return;
        const gl = this.gl;
        gl.uniform1f(this.uloc.iTime, t * 0.001);

        if (this.options.followMouse && this.options.mouseInfluence > 0.0) {
            const s = 0.92;
            this.smoothMouse.x = this.smoothMouse.x * s + this.mouse.x * (1 - s);
            this.smoothMouse.y = this.smoothMouse.y * s + this.mouse.y * (1 - s);
            gl.uniform2f(this.uloc.mousePos, this.smoothMouse.x, this.smoothMouse.y);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.animationId = requestAnimationFrame(this.loop);
    }
}

/* =========================================================
   MAIN INITIALIZATION (DOMContentLoaded)
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Navbar scroll effect
    const nav = document.querySelector('.site-nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });

    // ── Hamburger Menu ──────────────────────────────────
    const hamburger = document.getElementById('navHamburger');
    const drawer = document.getElementById('navDrawer');
    const overlay = document.getElementById('navOverlay');

    const openMenu = () => {
        hamburger.classList.add('is-open');
        drawer.classList.add('is-open');
        overlay.classList.add('is-open');
        hamburger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    };

    const closeMenu = () => {
        hamburger.classList.remove('is-open');
        drawer.classList.remove('is-open');
        overlay.classList.remove('is-open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    };

    hamburger.addEventListener('click', () => {
        hamburger.classList.contains('is-open') ? closeMenu() : openMenu();
    });

    // Fecha ao clicar no overlay
    overlay.addEventListener('click', closeMenu);

    // Fecha ao clicar em qualquer link do drawer
    drawer.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    // Fecha ao pressionar Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });

    // ── SIT Dropdown (Desktop) ─────────────────────────
    (function () {
        const dropdown = document.getElementById('sitDropdown');
        if (!dropdown) return;

        const trigger = dropdown.querySelector('.nav-dropdown-trigger');
        const menu = dropdown.querySelector('.nav-dropdown-menu');
        const submenu = dropdown.querySelector('.nav-dropdown-submenu');
        const submenuTrigger = submenu ? submenu.querySelector('.nav-dropdown-submenu-trigger') : null;

        let closeTimer = null;

        const openDropdown = () => {
            clearTimeout(closeTimer);
            dropdown.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
        };

        const scheduleClose = () => {
            closeTimer = setTimeout(() => {
                dropdown.classList.remove('is-open');
                trigger.setAttribute('aria-expanded', 'false');
                if (submenu) closeSubmenu();
            }, 120);
        };

        const openSubmenu = () => {
            clearTimeout(closeTimer);
            if (submenu) submenu.classList.add('is-open');
        };

        const closeSubmenu = () => {
            if (submenu) submenu.classList.remove('is-open');
        };

        // Trigger principal
        trigger.addEventListener('mouseenter', openDropdown);
        trigger.addEventListener('mouseleave', scheduleClose);

        // Menu principal
        menu.addEventListener('mouseenter', () => clearTimeout(closeTimer));
        menu.addEventListener('mouseleave', scheduleClose);

        // Submenu trigger
        if (submenuTrigger) {
            submenuTrigger.addEventListener('mouseenter', openSubmenu);
            submenuTrigger.addEventListener('mouseleave', () => {
                // Fecha o submenu só se o mouse não foi para o painel
                setTimeout(() => {
                    if (submenu && !submenu.querySelector('.nav-dropdown-submenu-panel:hover') &&
                        !submenu.matches(':hover')) {
                        closeSubmenu();
                    }
                }, 80);
            });
        }

        // Painel do submenu
        if (submenu) {
            const panel = submenu.querySelector('.nav-dropdown-submenu-panel');
            if (panel) {
                panel.addEventListener('mouseenter', () => clearTimeout(closeTimer));
                panel.addEventListener('mouseleave', scheduleClose);
            }
        }

        // Fecha ao pressionar Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dropdown.classList.remove('is-open');
                trigger.setAttribute('aria-expanded', 'false');
                closeSubmenu();
            }
        });
    })();

    // ── SIT Accordion (Mobile Drawer) ──────────────────
    const sitAccordion = document.getElementById('drawerSitAccordion');
    const sitTrigger = sitAccordion ? sitAccordion.querySelector('.drawer-accordion-trigger') : null;

    if (sitTrigger) {
        sitTrigger.addEventListener('click', () => {
            const isOpen = sitAccordion.classList.toggle('is-open');
            sitTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    // Start LightRays
    const container = document.getElementById('light-rays-container');
    if (container) {
        console.log("Iniciando LightRays no container...");
        new LightRays(container, {
            raysOrigin: 'top-center',
            raysColor: '#fdeaea',
            raysSpeed: 1.5,
            lightSpread: 0.8,
            rayLength: 1.2,
            followMouse: true,
            mouseInfluence: 0.1,
            noiseAmount: 0.1,
            distortion: 0.05,
            fadeDistance: 0.9
        });
    } else {
        console.error("Erro: Container #light-rays-container não encontrado!");
    }

    // MAGIC BENTO IMPLEMENTATION
    const bentoData = [
        { title: 'Instrutor Guarda-Vidas', description: 'Capacitação profissional avançada para instrutores de salvamento.', label: 'Formação', img: 'assets/img/IMG_1472.JPG.jpeg' },
        { title: 'Material', description: 'Material didático para os estudos de nossos alunos.', label: 'Material', img: 'assets/img/IMG_1820.JPG.jpeg', href: 'documentos.html' },
        { title: 'Cursos HSI/SOBRASA', description: 'Certificações internacionais reconhecidas pela Health & Safety Institute.', label: 'Certificação', img: 'assets/img/IMG_1846.JPG.jpeg' },
        { title: 'Depoimentos', description: 'O que dizem os heróis que passaram por nossos treinamentos.', label: 'Comunidade', img: 'assets/img/IMG_1870.JPG.jpeg' },
        { title: 'Galeria', description: 'Registros de missões, treinamentos e eventos oficiais.', label: 'Mídia', img: 'assets/img/IMG_1904.JPG.jpeg' },
        { title: 'Prevenção e Segurança', description: 'Programas educativos e protocolos de segurança aquática.', label: 'Sobrasa', img: 'assets/img/IMG_6608.JPG.jpeg' }
    ];

    const grid = document.getElementById('magic-bento-grid');
    const spotlight = document.createElement('div');
    spotlight.className = 'global-spotlight';
    document.body.appendChild(spotlight);

    bentoData.forEach(data => {
        const card = document.createElement(data.href ? 'a' : 'div');
        card.className = 'magic-bento-card magic-bento-card--border-glow';
        if (data.href) { card.href = data.href; card.style.textDecoration = 'none'; }
        card.innerHTML = `
            <img src="${data.img}" alt="${data.title}" class="magic-bento-card__bg">
            <div class="magic-bento-card__overlay"></div>
            <div class="magic-bento-card__header">
                <div class="magic-bento-card__label">${data.label}</div>
                <i data-lucide="plus" style="width: 16px; opacity: 0.5;"></i>
            </div>
            <div class="magic-bento-card__content">
                <h3 class="magic-bento-card__title">${data.title}</h3>
                <p class="magic-bento-card__description">${data.description}</p>
            </div>
        `;
        grid.appendChild(card);

        // Hover effects
        card.addEventListener('mousemove', (e) => {
            // Mantendo o evento caso queira adicionar outros efeitos no futuro, 
            // mas removendo a animação de Tilt solicitada.
        });

        card.addEventListener('mouseleave', () => {
            // Removendo reset de Tilt
        });

        // Click Ripple Effect
        card.addEventListener('click', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const maxDistance = Math.max(Math.hypot(x, y), Math.hypot(x - rect.width, y - rect.height));

            const ripple = document.createElement('div');
            ripple.style.cssText = `
                position: absolute; width: ${maxDistance * 2}px; height: ${maxDistance * 2}px;
                border-radius: 50%; background: radial-gradient(circle, rgba(222, 36, 39, 0.4) 0%, transparent 70%);
                left: ${x - maxDistance}px; top: ${y - maxDistance}px; pointer-events: none; z-index: 1000;
            `;
            card.appendChild(ripple);
            gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => ripple.remove() });
        });
    });

    // Global Spotlight Logic
    document.addEventListener('mousemove', (e) => {
        const gridRect = grid.getBoundingClientRect();
        const isInside = e.clientX >= gridRect.left && e.clientX <= gridRect.right &&
            e.clientY >= gridRect.top && e.clientY <= gridRect.bottom;

        const cards = grid.querySelectorAll('.magic-bento-card');

        if (isInside) {
            gsap.to(spotlight, { left: e.clientX, top: e.clientY, opacity: 1, duration: 0.1 });
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const relX = ((e.clientX - rect.left) / rect.width) * 100;
                const relY = ((e.clientY - rect.top) / rect.height) * 100;

                const dist = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
                const intensity = Math.max(0, 1 - dist / 400);

                card.style.setProperty('--glow-x', `${relX}%`);
                card.style.setProperty('--glow-y', `${relY}%`);
                card.style.setProperty('--glow-intensity', intensity);
            });
        } else {
            gsap.to(spotlight, { opacity: 0, duration: 0.3 });
            cards.forEach(card => card.style.setProperty('--glow-intensity', '0'));
        }
    });

    lucide.createIcons();

    // SCROLL REVEAL OBSERVER
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal-active');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-item').forEach((el) => revealObserver.observe(el));
});

/* =========================================================
   GALLERY GSAP — ScrollTrigger Horizontal Scroll
   ========================================================= */
window.addEventListener('load', () => {
    /* Register ScrollTrigger */
    gsap.registerPlugin(ScrollTrigger);

    const gallerySection = document.getElementById('gallery-section');
    const track = document.getElementById('galleryTrack');
    const progressBar = document.getElementById('galleryProgress');
    const gItems = gsap.utils.toArray('.g-item');
    const topoBg = gallerySection.querySelector('.gallery-topo-bg');

    if (!gallerySection || !track) return;

    let galleryMM = gsap.matchMedia();

    /* ── Horizontal scroll track (Desktop/Tablet only) ──── */
    galleryMM.add("(min-width: 769px)", () => {
        /* ── How far the track must travel ─────────────────── */
        const getScrollDist = () => {
            const trackWidth = track.scrollWidth;
            const viewWidth = window.innerWidth;
            return Math.max(0, trackWidth - viewWidth);
        };

        /* ── Make section tall enough for the scroll runway ── */
        const updateLayout = () => {
            const dist = getScrollDist();
            gallerySection.style.height = `${dist + window.innerHeight}px`;
            ScrollTrigger.refresh();
        };

        updateLayout();

        /* ── Main horizontal tween ─────────────────────────── */
        const hTween = gsap.to(track, {
            x: () => -getScrollDist(),
            ease: 'none',
            scrollTrigger: {
                trigger: gallerySection,
                start: 'top top',
                end: () => `+=${getScrollDist()}`,
                scrub: 1.2,
                pin: '.gallery-sticky',
                pinSpacing: true,
                invalidateOnRefresh: true,
                onUpdate: (self) => {
                    if (progressBar) progressBar.style.width = `${self.progress * 100}%`;
                }
            }
        });

        /* ── Parallax per depth layer ──────────────────────── */
        gItems.forEach((item) => {
            const speed = parseFloat(getComputedStyle(item).getPropertyValue('--g-parallax')) || 1;
            const offset = (speed - 1) * 150;
            gsap.fromTo(item,
                { x: -offset },
                {
                    x: offset,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: gallerySection,
                        start: 'top top',
                        end: () => `+=${getScrollDist()}`,
                        scrub: true,
                        containerAnimation: hTween,
                        invalidateOnRefresh: true
                    }
                }
            );
        });

        /* ── Topo background drifts slower (depth illusion) ── */
        if (topoBg) {
            gsap.fromTo(topoBg,
                { x: 0 },
                {
                    x: () => getScrollDist() * 0.15,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: gallerySection,
                        start: 'top top',
                        end: () => `+=${getScrollDist()}`,
                        scrub: 2,
                        invalidateOnRefresh: true
                    }
                }
            );
        }

        let resizeTimer;
        const onResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(updateLayout, 250);
        };
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            gallerySection.style.height = '';
        };
    });

    /* ── Header Reveal ─────────────────────────────── */
    gsap.from('.gallery-header', {
        y: 30,
        opacity: 0,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: {
            trigger: gallerySection,
            start: 'top 85%',
            toggleActions: 'play none none none'
        }
    });

    /* ── Items fade + rise as they enter viewport ──────── */
    gsap.fromTo(gItems,
        { opacity: 0, y: 50 },
        {
            opacity: 1,
            y: 0,
            stagger: 0.08,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: gallerySection,
                start: 'top 85%',
                toggleActions: 'play none none none'
            }
        }
    );

    /* ── Transition Image Parallax (Desktop Only) ────── */
    const heroSec = document.querySelector('.hero-section');
    let mm = gsap.matchMedia();

    mm.add("(min-width: 769px)", () => {
        const getBoardOffset = () => {
            const diff = heroSec.offsetHeight - window.innerHeight;
            return diff > 0 ? -diff : 0;
        };

        gsap.set(".section-transition-image", { y: getBoardOffset() });

        gsap.fromTo(".section-transition-image",
            { y: getBoardOffset },
            {
                y: 0,
                ease: "none",
                scrollTrigger: {
                    trigger: heroSec,
                    start: "top top",
                    end: "bottom center",
                    scrub: 1,
                    invalidateOnRefresh: true
                }
            }
        );
    });

    mm.add("(max-width: 768px)", () => {
        // No mobile, deixamos exatamente na metade (yPercent: -50)
        gsap.set(".section-transition-image", { yPercent: -50, clearProps: "y" });
    });
});

/* =========================================================
   LOGO LOOP SCRIPT
   ========================================================= */
(function () {
    const logos = [
        { src: 'assets/img/disneyLogo.png', alt: 'Parceiro 1' },
        { src: 'assets/img/disneyLogo.png', alt: 'Parceiro 2' },
        { src: 'assets/img/disneyLogo.png', alt: 'Parceiro 3' },
        { src: 'assets/img/disneyLogo.png', alt: 'Parceiro 4' },
        { src: 'assets/img/disneyLogo.png', alt: 'Parceiro 5' },
        { src: 'assets/img/disneyLogo.png', alt: 'Parceiro 6' },
    ];

    const track = document.getElementById('logoLoopInner');
    if (!track) return;

    function buildList(ariaHidden) {
        const ul = document.createElement('ul');
        ul.className = 'logoloop__list';
        ul.setAttribute('role', 'list');
        if (ariaHidden) ul.setAttribute('aria-hidden', 'true');
        logos.forEach(function (logo, i) {
            const li = document.createElement('li');
            li.className = 'logoloop__item';
            li.setAttribute('role', 'listitem');
            if (logo.src) {
                const img = document.createElement('img');
                img.src = logo.src;
                img.alt = logo.alt || '';
                img.loading = 'lazy';
                img.decoding = 'async';
                img.draggable = false;
                li.appendChild(img);
            } else {
                const span = document.createElement('span');
                span.className = 'logoloop__node';
                span.textContent = logo.text || '';
                li.appendChild(span);
            }
            ul.appendChild(li);

            const sep = document.createElement('li');
            sep.className = 'logoloop__separator';
            sep.setAttribute('aria-hidden', 'true');
            ul.appendChild(sep);
        });
        return ul;
    }

    const MIN_COPIES = 5;
    for (let i = 0; i < MIN_COPIES; i++) {
        track.appendChild(buildList(i > 0));
    }

    const SPEED = 80;
    let offset = 0;
    let seqWidth = 0;
    let rafId = null;
    let lastTs = null;
    let isHovered = false;

    function getSeqWidth() {
        const firstList = track.querySelector('.logoloop__list');
        return firstList ? firstList.getBoundingClientRect().width : 0;
    }

    function animate(ts) {
        if (lastTs === null) lastTs = ts;
        const dt = Math.max(0, ts - lastTs) / 1000;
        lastTs = ts;

        if (!isHovered && seqWidth > 0) {
            offset = (offset + SPEED * dt) % seqWidth;
            track.style.transform = 'translate3d(' + (-offset) + 'px, 0, 0)';
        }

        rafId = requestAnimationFrame(animate);
    }

    function init() {
        seqWidth = getSeqWidth();
        if (seqWidth > 0 && !rafId) {
            rafId = requestAnimationFrame(animate);
        }
    }

    window.addEventListener('resize', function () {
        seqWidth = getSeqWidth();
    });

    track.addEventListener('mouseenter', function () { isHovered = true; });
    track.addEventListener('mouseleave', function () { isHovered = false; });

    const imgs = track.querySelectorAll('img');
    let loaded = 0;
    let initCalled = false;
    function tryInit() {
        if (!initCalled) { initCalled = true; init(); }
    }
    if (imgs.length === 0) {
        tryInit();
    } else {
        imgs.forEach(function (img) {
            if (img.complete) {
                loaded++;
                if (loaded === imgs.length) tryInit();
            } else {
                img.addEventListener('load', function () {
                    loaded++;
                    if (loaded === imgs.length) tryInit();
                }, { once: true });
                img.addEventListener('error', function () {
                    loaded++;
                    if (loaded === imgs.length) tryInit();
                }, { once: true });
            }
        });
        setTimeout(tryInit, 500);
    }
})();
