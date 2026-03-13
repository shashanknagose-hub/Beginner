/*
    script.js
    Handles both sign.html and admin.html behaviors.
*/

const urlParams = new URLSearchParams(window.location.search);
const authorityName = urlParams.get('name') || '';

// ---------- SIGN PAGE ----------
if (window.location.pathname.includes('sign.html')) {
    const nameDisplay = document.getElementById('authName');
    const canvas = document.getElementById('signature-pad');
    const submitBtn = document.getElementById('submitBtn');
    const clearBtn = document.getElementById('clearBtn');

    // show name if provided
    nameDisplay.innerText = authorityName ? `Welcome, ${authorityName}` : 'Welcome, Honorable Guest';

    // Make canvas size responsive
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const w = canvas.clientWidth;
        canvas.width = w * ratio;
        canvas.height = 200 * ratio;
        canvas.getContext('2d').scale(ratio, ratio);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const signaturePad = new SignaturePad(canvas, { backgroundColor: 'rgba(255,255,255,0)' });

    clearBtn.addEventListener('click', () => signaturePad.clear());

    submitBtn.addEventListener('click', async () => {
        if (signaturePad.isEmpty()) return alert('Please provide a signature.');
        const dataURL = signaturePad.toDataURL('image/png');
        const timestamp = new Date().toLocaleString();

        // Save to Firebase
        try {
            await refs.signatures.push({
                name: authorityName || 'Guest',
                signature: dataURL,
                time: timestamp
            });

            // Show poster
            document.getElementById('sign-section').classList.add('hidden');
            const poster = document.getElementById('poster-section');
            poster.classList.remove('hidden');
            document.getElementById('poster-name').innerText = authorityName || 'Honorable Guest';
            document.getElementById('poster-sig').src = dataURL;

            // Setup poster download
            document.getElementById('downloadPoster').addEventListener('click', async () => {
                const node = poster;
                const canvasImg = await html2canvas(node, { scale: 2 });
                const url = canvasImg.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = url;
                link.download = `${(authorityName||'guest').replace(/\s+/g,'_')}_invitation.png`;
                document.body.appendChild(link);
                link.click();
                link.remove();
            }, { once: true });

        } catch (err) {
            alert('Error saving signature: ' + err.message);
        }
    });
}

// ---------- ADMIN PAGE ----------
if (window.location.pathname.includes('admin.html')) {
    const incomingList = document.getElementById('incoming-list');
    const authoritiesList = document.getElementById('authoritiesList');
    const addBtn = document.getElementById('addAuthorities');
    const clearBtn = document.getElementById('clearAuthorities');
    const input = document.getElementById('authorityInput');

    // Render an authority row
    function renderAuthorityRow(key, entry) {
        const div = document.createElement('div');
        div.className = 'list-card';
        const left = document.createElement('div');
        left.style.flex = '1';
        left.innerHTML = `<div><strong>${entry.name}</strong></div><div class="muted">Link: <a href="${entry.link}" target="_blank">Open</a></div>`;

        const qrWrap = document.createElement('div');
        qrWrap.className = 'qr-place';
        const qr = document.createElement('div');
        qrWrap.appendChild(qr);

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn outline';
        downloadBtn.innerText = 'Download QR';

        div.appendChild(left);
        div.appendChild(qrWrap);
        div.appendChild(downloadBtn);

        authoritiesList.prepend(div);

        // generate QR
        const qrcode = new QRCode(qr, {text: entry.link, width: 110, height: 110});

        downloadBtn.addEventListener('click', () => {
            // QRCode lib produces an <img> or <canvas> inside qr
            const img = qr.querySelector('img') || qr.querySelector('canvas');
            if (!img) return alert('QR not ready');
            let url;
            if (img.tagName === 'IMG') url = img.src;
            else url = img.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `${entry.name.replace(/\s+/g,'_')}_qr.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        });
    }

    // add authorities (multiple lines)
    addBtn.addEventListener('click', async () => {
        const raw = input.value.trim();
        if (!raw) return alert('Please enter at least one name.');
        const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
        for (const name of lines) {
            // create link relative to current site
            const link = `${location.origin}${location.pathname.replace(/admin\.html$/,'') || '/'}sign.html?name=${encodeURIComponent(name)}`;
            // push to Firebase
            const newRef = await refs.authorities.push({ name, link });
            renderAuthorityRow(newRef.key, { name, link });
        }
        input.value = '';
    });

    clearBtn.addEventListener('click', () => { if (confirm('Clear on-screen authority list display? This does not delete from database.')) { authoritiesList.innerHTML = ''; } });

    // Listen for incoming signatures in real-time
    refs.signatures.limitToLast(100).on('child_added', snapshot => {
        const data = snapshot.val();
        const card = document.createElement('div');
        card.className = 'list-card';
        const left = document.createElement('div');
        left.innerHTML = `<div><strong>${data.name}</strong></div><div class="muted">${data.time}</div>`;

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.gap = '8px';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn primary';
        viewBtn.innerText = 'Preview & Print';
        viewBtn.onclick = () => printReceipt(data.name, data.signature, data.time);

        right.appendChild(viewBtn);
        card.appendChild(left);
        card.appendChild(right);

        incomingList.prepend(card);
    });

    window.printReceipt = function(name, sigURL, time) {
        const printArea = document.getElementById('print-area');
        printArea.classList.remove('hidden');
        document.getElementById('print-name').innerText = name;
        document.getElementById('print-sig').src = sigURL;
        document.getElementById('print-date').innerText = time;

        // Trigger browser print (choose Bluetooth printer on organizer device)
        window.print();

        printArea.classList.add('hidden');
    };

    // load existing authorities from database and render
    refs.authorities.on('child_added', snapshot => {
        const entry = snapshot.val();
        renderAuthorityRow(snapshot.key, entry);
    });
}