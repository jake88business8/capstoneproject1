const fiberflow = {
    consentKey: 'fiberflow-tracking-consent',
    forms: {},
};

function $(selector, scope = document) {
    return scope.querySelector(selector);
}

function $all(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
}

async function serializeForm(form) {
    const formData = new FormData(form);
    const json = {};
    const tasks = [];

    formData.forEach((value, key) => {
        if (value instanceof File) {
            if (!value.size) return;
            tasks.push(
                new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result;
                        if (typeof result === 'string') {
                            const [, base64] = result.split(',');
                            json[key] = {
                                name: value.name,
                                type: value.type,
                                data: base64,
                            };
                        }
                        resolve(null);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(value);
                })
            );
        } else {
            json[key] = value;
        }
    });

    await Promise.all(tasks);
    return json;
}

async function submitForm({ form, endpoint, successMessage, errorMessage, extra = {} }) {
    if (!form) return;
    const statusField = form.querySelector('[data-response]') || form.querySelector('[data-quick-response]');
    const submitButton = form.querySelector('button[type="submit"], .btn[type="submit"]');

    const showStatus = (message, tone = 'neutral') => {
        if (statusField) {
            statusField.textContent = message;
            statusField.dataset.tone = tone;
        }
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const payload = { ...(await serializeForm(form)), ...extra };
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.dataset.loading = 'true';
        }

        showStatus('Sending…', 'info');

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`Request failed with ${response.status}`);
            }

            form.reset();
            showStatus(successMessage, 'success');
        } catch (error) {
            console.error('FiberFlow form error', error);
            showStatus(errorMessage, 'error');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                delete submitButton.dataset.loading;
            }
        }
    });
}

function ready(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

function loadScript(src, attributes = {}) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        Object.entries(attributes).forEach(([key, value]) => {
            script.setAttribute(key, value);
        });
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function enableTracking() {
    const { gaId, metaPixelId } = window.fiberflowTracking || {};

    if (gaId && gaId !== 'G-XXXXXXXXXX') {
        loadScript('https://www.googletagmanager.com/gtag/js?id=' + gaId, { async: '' })
            .then(() => {
                window.dataLayer = window.dataLayer || [];
                function gtag() {
                    window.dataLayer.push(arguments);
                }
                gtag('js', new Date());
                gtag('config', gaId, { anonymize_ip: true });
            })
            .catch((error) => console.warn('GA4 load failed', error));
    }

    if (metaPixelId && metaPixelId !== '000000000000000') {
        window.fbq = function fbq() {
            fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
        };
        if (!window._fbq) window._fbq = fbq;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = '2.0';
        fbq.queue = [];
        loadScript('https://connect.facebook.net/en_US/fbevents.js')
            .then(() => {
                fbq('init', metaPixelId);
                fbq('track', 'PageView');
            })
            .catch((error) => console.warn('Meta Pixel load failed', error));
    }
}

ready(() => {
    $all('[data-current-year]').forEach((el) => {
        el.textContent = String(new Date().getFullYear());
    });

    const consentBanner = $('.consent-banner');
    const storedConsent = localStorage.getItem(fiberflow.consentKey);

    if (storedConsent === 'granted') {
        enableTracking();
    } else if (storedConsent === 'denied') {
        consentBanner?.classList.add('hidden');
    } else {
        consentBanner?.classList.remove('hidden');
    }

    $all('[data-consent-action]').forEach((button) => {
        button.addEventListener('click', () => {
            const action = button.dataset.consentAction;
            const decision = action === 'accept' ? 'granted' : 'denied';
            localStorage.setItem(fiberflow.consentKey, decision);
            if (action === 'accept') {
                enableTracking();
            }
            consentBanner?.classList.add('hidden');
        });
    });

    submitForm({
        form: $('#coverageQuickForm'),
        endpoint: 'https://billing.fiberflow.com.ph/api/prospects/quick-check',
        successMessage: 'Thanks! We’ll verify coverage and text/call you within the day.',
        errorMessage: 'We couldn’t send this automatically. Please message us via FB or SMS.',
        extra: {
            source: 'website-quick-check',
        },
    });

    submitForm({
        form: $('#coverageForm'),
        endpoint: 'https://billing.fiberflow.com.ph/api/prospects/address-check',
        successMessage: 'Request received. Our planners will reach out shortly.',
        errorMessage: 'Please try again or message us directly while we check the system.',
        extra: {
            source: 'website-coverage-page',
        },
    });

    submitForm({
        form: $('#getConnectedForm'),
        endpoint: 'https://billing.fiberflow.com.ph/api/prospects',
        successMessage: 'Thanks! We’ll verify coverage and text/call you within the day.',
        errorMessage: 'Something went wrong. Message us on Messenger or SMS so we can assist right away.',
        extra: {
            automation: {
                createProspect: true,
                notifyChannels: ['telegram', 'email'],
                assignInstaller: 'nearest-area',
            },
        },
    });

    submitForm({
        form: $('#supportTicketForm'),
        endpoint: 'https://support.fiberflow.com.ph/api/tickets',
        successMessage: 'Ticket logged. Expect an acknowledgement with ETA shortly.',
        errorMessage: 'We could not log the ticket. Please message support through FB or SMS.',
        extra: {
            source: 'website-support',
        },
    });
});
