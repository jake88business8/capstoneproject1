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

    if (document.body.dataset.page === 'operations') {
        const napData = [
            {
                id: 'NAP-ODG-01',
                municipality: 'Odiongan',
                barangay: 'Tabing Dagat',
                pon: 'PON-ODG-12',
                lcp: 'LCP-ODG-01',
                totalPorts: 16,
                activePorts: 11,
                status: 'operational',
                nextPort: 12,
                focusCustomer: {
                    name: 'Juan Dela Cruz',
                    pon: 'PON-ODG-12',
                    lcp: 'LCP-ODG-01',
                    nap: 'NAP-ODG-01',
                    port: '12',
                },
            },
            {
                id: 'NAP-ODG-02',
                municipality: 'Odiongan',
                barangay: 'Libertad',
                pon: 'PON-ODG-08',
                lcp: 'LCP-ODG-02',
                totalPorts: 24,
                activePorts: 24,
                status: 'operational',
                focusCustomer: {
                    name: 'Fully Utilised',
                    pon: 'PON-ODG-08',
                    lcp: 'LCP-ODG-02',
                    nap: 'NAP-ODG-02',
                    port: 'All ports active',
                },
            },
            {
                id: 'NAP-SAN-01',
                municipality: 'San Andres',
                barangay: 'Poblacion',
                pon: 'PON-SAN-05',
                lcp: 'LCP-SAN-01',
                totalPorts: 32,
                activePorts: 26,
                status: 'operational',
                nextPort: 27,
                focusCustomer: {
                    name: 'Maria Santos',
                    pon: 'PON-SAN-05',
                    lcp: 'LCP-SAN-01',
                    nap: 'NAP-SAN-01',
                    port: '27',
                },
            },
            {
                id: 'NAP-SAN-02',
                municipality: 'San Andres',
                barangay: 'Calunacon',
                pon: 'PON-SAN-03',
                lcp: 'LCP-SAN-02',
                totalPorts: 16,
                activePorts: 8,
                status: 'operational',
                nextPort: 9,
                focusCustomer: {
                    name: 'Next install slot',
                    pon: 'PON-SAN-03',
                    lcp: 'LCP-SAN-02',
                    nap: 'NAP-SAN-02',
                    port: '09',
                },
            },
            {
                id: 'NAP-CAL-01',
                municipality: 'Calatrava',
                barangay: 'Poblacion',
                pon: 'PON-CAL-01',
                lcp: 'LCP-CAL-01',
                totalPorts: 16,
                activePorts: 6,
                status: 'operational',
                nextPort: 7,
                focusCustomer: {
                    name: 'Cable pull scheduled',
                    pon: 'PON-CAL-01',
                    lcp: 'LCP-CAL-01',
                    nap: 'NAP-CAL-01',
                    port: '07',
                },
            },
            {
                id: 'NAP-SAG-01',
                municipality: 'San Agustin',
                barangay: 'Dapdapan',
                pon: 'PON-SAG-02',
                lcp: 'LCP-SAG-01',
                totalPorts: 12,
                activePorts: 12,
                status: 'maintenance',
                focusCustomer: {
                    name: 'Maintenance window',
                    pon: 'PON-SAG-02',
                    lcp: 'LCP-SAG-01',
                    nap: 'NAP-SAG-01',
                    port: 'Temporarily offline',
                },
            },
        ];

        const napById = new Map(napData.map((record) => [record.id, record]));
        const municipalitySelect = $('[data-nap-filter="municipality"]');
        const statusSelect = $('[data-nap-filter="status"]');
        const searchInput = $('[data-nap-filter="search"]');
        const napTableBody = $('[data-nap-table] tbody');
        const totalField = $('[data-nap-total]');
        const availableField = $('[data-nap-available]');
        const utilisationField = $('[data-nap-utilisation]');
        const customerNameField = $('[data-customer-name]');
        const customerPonField = $('[data-customer-pon]');
        const customerLcpField = $('[data-customer-lcp]');
        const customerNapField = $('[data-customer-nap]');
        const customerPortField = $('[data-customer-port]');

        const formatNumber = (value) => new Intl.NumberFormat('en-PH').format(Math.round(value));
        const filters = {
            municipality: 'all',
            status: 'all',
            search: '',
        };
        let activeNapId = napData[0]?.id ?? null;

        const getNapState = (record) => {
            if (record.status === 'maintenance') {
                return 'maintenance';
            }
            const available = Math.max(record.totalPorts - record.activePorts, 0);
            if (available === 0) {
                return 'full';
            }
            return 'available';
        };

        const populateMunicipalities = () => {
            if (!municipalitySelect) return;
            const unique = Array.from(new Set(napData.map((record) => record.municipality))).sort();
            unique.forEach((municipality) => {
                const option = document.createElement('option');
                option.value = municipality;
                option.textContent = municipality;
                municipalitySelect.appendChild(option);
            });
        };

        const highlightActiveRow = () => {
            if (!napTableBody) return;
            $all('tr', napTableBody).forEach((row) => {
                row.classList.toggle('is-active', row.dataset.napId === activeNapId);
            });
        };

        const updateCustomerFields = (record) => {
            if (!customerNameField || !customerPonField || !customerLcpField || !customerNapField || !customerPortField) {
                return;
            }

            if (!record) {
                customerNameField.textContent = 'No NAP selected';
                customerPonField.textContent = '—';
                customerLcpField.textContent = '—';
                customerNapField.textContent = '—';
                customerPortField.textContent = '—';
                return;
            }

            const available = Math.max(record.totalPorts - record.activePorts, 0);
            const fallbackPort = available > 0 ? String(record.nextPort ?? record.activePorts + 1).padStart(2, '0') : 'All ports reserved';
            const detail = record.focusCustomer || {
                name: available > 0 ? 'Next install slot' : 'Fully utilised',
                pon: record.pon,
                lcp: record.lcp,
                nap: record.id,
                port: fallbackPort,
            };

            customerNameField.textContent = detail.name;
            customerPonField.textContent = detail.pon;
            customerLcpField.textContent = detail.lcp;
            customerNapField.textContent = detail.nap;
            customerPortField.textContent = detail.port;
        };

        const renderNapTable = () => {
            if (!napTableBody) return;
            let filtered = napData;

            if (filters.municipality !== 'all') {
                filtered = filtered.filter((record) => record.municipality === filters.municipality);
            }

            if (filters.status !== 'all') {
                filtered = filtered.filter((record) => {
                    const state = getNapState(record);
                    if (filters.status === 'available') return state === 'available';
                    if (filters.status === 'full') return state === 'full';
                    if (filters.status === 'maintenance') return state === 'maintenance';
                    return true;
                });
            }

            if (filters.search) {
                const term = filters.search.toLowerCase();
                filtered = filtered.filter((record) =>
                    [record.id, record.barangay, record.pon, record.lcp].some((value) => value.toLowerCase().includes(term))
                );
            }

            napTableBody.innerHTML = '';

            const selectedExists = filtered.some((record) => record.id === activeNapId);
            activeNapId = selectedExists ? activeNapId : filtered[0]?.id ?? null;

            const totals = filtered.reduce(
                (acc, record) => {
                    const available = Math.max(record.totalPorts - record.activePorts, 0);
                    acc.totalPorts += record.totalPorts;
                    acc.activePorts += record.activePorts;
                    acc.availablePorts += available;
                    return acc;
                },
                { totalPorts: 0, activePorts: 0, availablePorts: 0 }
            );

            filtered.forEach((record) => {
                const available = Math.max(record.totalPorts - record.activePorts, 0);
                const state = getNapState(record);
                const statusClass =
                    state === 'maintenance' ? 'status-maintenance' : state === 'full' ? 'status-full' : 'status-available';
                const statusLabel =
                    state === 'maintenance' ? 'Under maintenance' : state === 'full' ? 'Fully utilised' : 'Ports available';

                const row = document.createElement('tr');
                row.dataset.napId = record.id;
                row.tabIndex = 0;
                row.innerHTML = `
                    <td>${record.id}</td>
                    <td>${record.municipality}</td>
                    <td>${record.barangay}</td>
                    <td>${record.pon}</td>
                    <td>${record.lcp}</td>
                    <td class="numeric">${formatNumber(record.totalPorts)}</td>
                    <td class="numeric">${formatNumber(available)}</td>
                    <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                `;

                row.addEventListener('click', () => {
                    activeNapId = record.id;
                    updateCustomerFields(record);
                    highlightActiveRow();
                });

                row.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        activeNapId = record.id;
                        updateCustomerFields(record);
                        highlightActiveRow();
                    }
                });

                if (record.id === activeNapId) {
                    row.classList.add('is-active');
                }

                napTableBody.appendChild(row);
            });

            if (totalField) totalField.textContent = formatNumber(filtered.length);
            if (availableField) availableField.textContent = formatNumber(totals.availablePorts);
            if (utilisationField) {
                const utilisation = totals.totalPorts ? Math.round((totals.activePorts / totals.totalPorts) * 100) : 0;
                utilisationField.textContent = `${utilisation}%`;
            }

            updateCustomerFields(activeNapId ? napById.get(activeNapId) : null);
            highlightActiveRow();
        };

        populateMunicipalities();
        renderNapTable();

        municipalitySelect?.addEventListener('change', (event) => {
            filters.municipality = event.target.value;
            renderNapTable();
        });

        statusSelect?.addEventListener('change', (event) => {
            filters.status = event.target.value;
            renderNapTable();
        });

        searchInput?.addEventListener('input', (event) => {
            filters.search = event.target.value.trim();
            renderNapTable();
        });

        const reportData = {
            sales: {
                summary: [
                    { label: 'Recognized revenue', value: 1245000, note: 'Feb 2025 billing run' },
                    { label: 'Accounts receivable', value: 185000, note: 'Within 15-day ageing' },
                    { label: 'Output VAT', value: 148800, note: '12% of recognised sales' },
                ],
                entries: [
                    {
                        date: '2025-02-05',
                        reference: 'INV-2025-0012',
                        description: 'Residential subscriptions – February',
                        amount: 325000,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-08',
                        reference: 'INV-2025-0017',
                        description: 'SME dedicated fiber (Odiongan)',
                        amount: 185000,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-10',
                        reference: 'SOA-2025-0003',
                        description: 'Installation fees collected',
                        amount: 86500,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-14',
                        reference: 'INV-2025-0020',
                        description: 'Enterprise SLA uplift – municipal hall',
                        amount: 210000,
                        status: 'Pending',
                    },
                ],
                balances: [
                    { label: 'Accounts Receivable', value: 185000 },
                    { label: 'Accounts Payable', value: 92000 },
                    { label: 'Petty Cash', value: 18000 },
                    { label: 'Cash on Hand', value: 125000 },
                ],
            },
            expenses: {
                summary: [
                    { label: 'Network OPEX', value: 486000, note: 'Backhaul, power, tower rent' },
                    { label: 'Payroll & benefits', value: 312000, note: 'Installers + NOC' },
                    { label: 'CapEx drawdown', value: 95000, note: 'New NAP deployments' },
                ],
                entries: [
                    {
                        date: '2025-02-03',
                        reference: 'BILL-2025-0045',
                        description: 'Infinivan transport invoice',
                        amount: 185000,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-07',
                        reference: 'PAY-2025-0019',
                        description: 'Installer payroll – Feb 1-15',
                        amount: 142000,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-09',
                        reference: 'PO-2025-0008',
                        description: 'Fiber drop cables – 5km replenishment',
                        amount: 95000,
                        status: 'Pending',
                    },
                    {
                        date: '2025-02-12',
                        reference: 'BILL-2025-0053',
                        description: 'Power & generator diesel',
                        amount: 69000,
                        status: 'Posted',
                    },
                ],
                balances: [
                    { label: 'Accounts Receivable', value: 185000 },
                    { label: 'Accounts Payable', value: 154000 },
                    { label: 'Petty Cash', value: 12000 },
                    { label: 'Disbursement Float', value: 45000 },
                ],
            },
            taxes: {
                summary: [
                    { label: 'Output VAT', value: 148800, note: 'From recognised sales' },
                    { label: 'Input VAT', value: 86400, note: 'Awaiting BIR Form 2307' },
                    { label: 'Withholding tax', value: 42500, note: 'Expanded 2% & 5%' },
                ],
                entries: [
                    {
                        date: '2025-02-11',
                        reference: 'VAT-2025-02',
                        description: 'Output VAT – February',
                        amount: 148800,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-11',
                        reference: 'VAT-INPUT-2025-02',
                        description: 'Input VAT – supplier invoices',
                        amount: -86400,
                        status: 'In Review',
                    },
                    {
                        date: '2025-02-15',
                        reference: 'BIR-2550M',
                        description: 'VAT return filing prep',
                        amount: 62400,
                        status: 'Pending',
                    },
                ],
                balances: [
                    { label: 'VAT Payable', value: 62400 },
                    { label: 'EWT Payable', value: 42500 },
                    { label: 'SSS/Pag-IBIG/PhilHealth', value: 38900 },
                    { label: 'BIR Remittances Due', value: 0 },
                ],
            },
            cash: {
                summary: [
                    { label: 'Cash on hand', value: 125000, note: 'Including installer floats' },
                    { label: 'Bank balance', value: 842000, note: 'Operating account' },
                    { label: 'Petty cash', value: 18000, note: 'CSR + field allowances' },
                ],
                entries: [
                    {
                        date: '2025-02-02',
                        reference: 'CDJ-2025-0007',
                        description: 'Cash disbursement – emergency repairs',
                        amount: -25000,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-06',
                        reference: 'CRJ-2025-0011',
                        description: 'Collections – online payments',
                        amount: 415000,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-09',
                        reference: 'AR-2025-0004',
                        description: 'Accounts receivable settlement',
                        amount: 92000,
                        status: 'Posted',
                    },
                    {
                        date: '2025-02-13',
                        reference: 'CDJ-2025-0010',
                        description: 'Petty cash replenishment',
                        amount: -12000,
                        status: 'Posted',
                    },
                ],
                balances: [
                    { label: 'Accounts Receivable', value: 93000 },
                    { label: 'Accounts Payable', value: 112000 },
                    { label: 'Petty Cash', value: 18000 },
                    { label: 'Cash on Hand', value: 125000 },
                ],
            },
        };

        const statusClassMap = {
            Posted: 'status-posted',
            Pending: 'status-pending',
            'In Review': 'status-draft',
            Overdue: 'status-overdue',
            Paid: 'status-posted',
            Settled: 'status-posted',
        };

        const reportSummaryContainer = $('[data-report-summary]');
        const reportTableBody = $('[data-report-table] tbody');
        const balanceList = $('[data-balance-list]');

        const formatCurrency = (value) =>
            new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).format(value);

        const renderReport = (type) => {
            const dataset = reportData[type];
            if (!dataset) return;

            if (reportSummaryContainer) {
                reportSummaryContainer.innerHTML = '';
                dataset.summary.forEach((item) => {
                    const card = document.createElement('article');
                    card.className = 'stat-card';
                    card.innerHTML = `
                        <span>${item.label}</span>
                        <strong>${formatCurrency(item.value)}</strong>
                        ${item.note ? `<small>${item.note}</small>` : ''}
                    `;
                    reportSummaryContainer.appendChild(card);
                });
            }

            if (reportTableBody) {
                reportTableBody.innerHTML = '';
                dataset.entries.forEach((entry) => {
                    const row = document.createElement('tr');
                    const amount = formatCurrency(entry.amount);
                    const statusClass = statusClassMap[entry.status] || 'status-draft';
                    row.innerHTML = `
                        <td>${entry.date}</td>
                        <td>${entry.reference}</td>
                        <td>${entry.description}</td>
                        <td class="numeric">${amount}</td>
                        <td><span class="status-pill ${statusClass}">${entry.status}</span></td>
                    `;
                    reportTableBody.appendChild(row);
                });
            }

            if (balanceList) {
                balanceList.innerHTML = '';
                dataset.balances.forEach((item) => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span>${item.label}</span><strong>${formatCurrency(item.value)}</strong>`;
                    balanceList.appendChild(li);
                });
            }
        };

        const tabs = $all('[data-report-tab]');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                const type = tab.dataset.reportTab;
                tabs.forEach((btn) => btn.setAttribute('aria-selected', String(btn === tab)));
                renderReport(type);
            });
        });

        renderReport('sales');

        const inventoryData = [
            { id: 'onu-huawei', item: 'Huawei HG8145V5 ONU', category: 'ONU', inStock: 68, reserved: 12, reorderPoint: 10 },
            { id: 'onu-zte', item: 'ZTE F670L ONU', category: 'ONU', inStock: 42, reserved: 18, reorderPoint: 8 },
            { id: 'drop-cable', item: '1-Core Drop Cable (1km)', category: 'Fiber & cables', inStock: 15, reserved: 6, reorderPoint: 5 },
            { id: 'patch-cord', item: 'SC/APC Patch Cord', category: 'Accessories', inStock: 190, reserved: 40, reorderPoint: 30 },
            { id: 'splice-protectors', item: 'Splice Protectors', category: 'Consumables', inStock: 380, reserved: 120, reorderPoint: 80 },
            { id: 'pole-hardware', item: 'Pole hardware kit', category: 'Hardware', inStock: 25, reserved: 10, reorderPoint: 6 },
        ];

        const inventoryTableBody = $('[data-inventory-table] tbody');
        const stockCountField = $('[data-stock-count]');
        const criticalCountField = $('[data-critical-count]');
        const openOrdersField = $('[data-open-orders]');
        const jobOrderForm = $('#jobOrderForm');
        const jobItemsContainer = $('[data-job-items]');
        const jobSummary = $('[data-job-summary]');
        const jobResponse = $('[data-joborder-response]');

        let openJobOrders = 3;
        let jobSequence = 1287;

        const getAvailableQuantity = (item) => Math.max(item.inStock - item.reserved, 0);

        const renderInventory = () => {
            if (!inventoryTableBody) return;
            inventoryTableBody.innerHTML = '';
            let totalAvailable = 0;
            let criticalItems = 0;

            inventoryData.forEach((item) => {
                const available = getAvailableQuantity(item);
                totalAvailable += available;
                if (available <= item.reorderPoint) {
                    criticalItems += 1;
                }

                const statusClass = available <= item.reorderPoint ? 'status-critical' : 'status-healthy';
                const statusLabel = available <= item.reorderPoint ? 'Reorder' : 'Healthy';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.item}</td>
                    <td>${item.category}</td>
                    <td class="numeric">${formatNumber(item.inStock)}</td>
                    <td class="numeric">${formatNumber(item.reserved)}</td>
                    <td class="numeric">${formatNumber(available)}</td>
                    <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                `;
                inventoryTableBody.appendChild(row);
            });

            if (stockCountField) stockCountField.textContent = formatNumber(totalAvailable);
            if (criticalCountField) criticalCountField.textContent = String(criticalItems);
            if (openOrdersField) openOrdersField.textContent = String(openJobOrders);
        };

        const renderJobItems = () => {
            if (!jobItemsContainer) return;
            jobItemsContainer.innerHTML = '';
            inventoryData.forEach((item) => {
                const available = getAvailableQuantity(item);
                const wrapper = document.createElement('div');
                wrapper.className = 'job-item';
                const inputName = `item-${item.id}`;
                wrapper.innerHTML = `
                    <label for="${inputName}">
                        <span>${item.item}</span>
                        <small>${item.category} • Available: ${formatNumber(available)}</small>
                    </label>
                    <input type="number" id="${inputName}" name="${inputName}" min="0" max="${available}" value="0" step="1" ${
                        available === 0 ? 'disabled' : ''
                    } />
                `;
                const input = wrapper.querySelector('input');
                input.addEventListener('input', () => {
                    const max = Number(input.max);
                    let value = Number(input.value);
                    if (Number.isNaN(value) || value < 0) value = 0;
                    if (value > max) value = max;
                    input.value = String(value);
                    updateJobSummary();
                });
                jobItemsContainer.appendChild(wrapper);
            });
        };

        const getJobSelections = () => {
            if (!jobOrderForm) return [];
            return inventoryData
                .map((item) => {
                    const input = jobOrderForm.querySelector(`[name="item-${item.id}"]`);
                    const qty = input ? Number(input.value) || 0 : 0;
                    return { item, qty };
                })
                .filter(({ qty }) => qty > 0);
        };

        const updateJobSummary = () => {
            if (!jobSummary) return;
            const selections = getJobSelections();
            if (!selections.length) {
                jobSummary.innerHTML = '<strong>No items selected yet.</strong>';
                return;
            }

            const totalUnits = selections.reduce((sum, selection) => sum + selection.qty, 0);
            const lines = selections
                .map((selection) => `<li>${selection.qty} × ${selection.item.item}</li>`)
                .join('');
            jobSummary.innerHTML = `
                <strong>${totalUnits} unit${totalUnits === 1 ? '' : 's'} reserved</strong>
                <ul>${lines}</ul>
            `;
        };

        jobOrderForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            const selections = getJobSelections();
            if (!selections.length) {
                if (jobResponse) {
                    jobResponse.textContent = 'Select at least one consumable to reserve.';
                    jobResponse.dataset.tone = 'error';
                }
                return;
            }

            const insufficient = selections.find(({ item, qty }) => qty > getAvailableQuantity(item));
            if (insufficient) {
                if (jobResponse) {
                    jobResponse.textContent = `Only ${getAvailableQuantity(insufficient.item)} pcs available for ${insufficient.item.item}.`;
                    jobResponse.dataset.tone = 'error';
                }
                return;
            }

            selections.forEach(({ item, qty }) => {
                item.reserved += qty;
            });

            openJobOrders += 1;
            jobSequence += 1;
            const totalUnits = selections.reduce((sum, selection) => sum + selection.qty, 0);
            const reference = `JO-2025-${String(jobSequence).padStart(4, '0')}`;

            if (jobResponse) {
                jobResponse.textContent = `${reference} staged with ${selections.length} line item${
                    selections.length === 1 ? '' : 's'
                } (${totalUnits} pcs).`;
                jobResponse.dataset.tone = 'success';
            }

            jobOrderForm.reset();
            renderInventory();
            renderJobItems();
            updateJobSummary();
        });

        renderInventory();
        renderJobItems();
        updateJobSummary();
    }
});
