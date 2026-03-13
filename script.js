/*
    script.js
    Handles both sign.html and admin.html behaviors.
*/

const urlParams = new URLSearchParams(window.location.search);
const authorityName = urlParams.get('name') || '';
let posterURL = '';

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
        // Save to Firebase and upload signature to storage so organizer can download
        try {
            // convert dataURL to blob
            function dataURLtoBlob(dataurl) {
                const arr = dataurl.split(',');
                const mime = arr[0].match(/:(.*?);/)[1];
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                return new Blob([u8arr], { type: mime });
            }

            const blob = dataURLtoBlob(dataURL);
            // safe filename
            const safeName = (authorityName || 'guest').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
            const filePath = `signatures/${Date.now()}_${safeName}.png`;
            const storageRef = firebase.storage().ref();
            const snap = await storageRef.child(filePath).put(blob);
            const downloadURL = await snap.ref.getDownloadURL();

            // push metadata to database (keep signature dataURL for backward compatibility)
            await refs.signatures.push({
                name: authorityName || 'Guest',
                signature: dataURL,
                signatureURL: downloadURL,
                time: timestamp
            });

            // Show poster (use uploaded poster if available)
            document.getElementById('sign-section').classList.add('hidden');
            const poster = document.getElementById('poster-section');
            poster.classList.remove('hidden');
            document.getElementById('poster-name').innerText = authorityName || 'Honorable Guest';
            document.getElementById('poster-sig').src = dataURL;
            if (posterURL) {
                document.getElementById('poster-image').src = posterURL;
            } else {
                document.getElementById('poster-image').style.display = 'none';
            }

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

    // Load poster URL if set by organizer
    refs.poster.on('value', snapshot => {
        const val = snapshot.val();
        if (val && val.url) {
            posterURL = val.url;
            const img = document.getElementById('poster-image');
            if (img) {
                img.src = posterURL;
                img.style.display = 'block';
            }
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

    // Paginated signature loading with live updates
    const PAGE_SIZE = 10;
    let earliestKey = null; // smallest (oldest) key currently loaded
    let newestKey = null; // largest (newest) key currently loaded
    const renderedKeys = new Set();

    function createSignatureCard(key, data, prepend = true) {
        if (renderedKeys.has(key)) return null;
        const card = document.createElement('div');
        card.className = 'list-card';
        card.dataset.key = key;

        const left = document.createElement('div');
        left.innerHTML = `<div><strong>${data.name}</strong></div><div class="muted">${data.time}</div>`;

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.gap = '8px';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn primary';
        viewBtn.innerText = 'Preview & Print';
        viewBtn.onclick = () => printReceipt(data.name, data.signature, data.time);

        const downloadSig = document.createElement('button');
        downloadSig.className = 'btn outline';
        downloadSig.innerText = 'Download Sig';
        downloadSig.addEventListener('click', async () => {
            try {
                if (data.signatureURL) {
                    const a = document.createElement('a');
                    a.href = data.signatureURL;
                    a.download = `${(data.name||'guest').replace(/\s+/g,'_')}_signature.png`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } else if (data.signature) {
                    const a = document.createElement('a');
                    a.href = data.signature;
                    a.download = `${(data.name||'guest').replace(/\s+/g,'_')}_signature.png`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } else {
                    alert('No signature available for download.');
                }
            } catch (e) { alert('Download failed: ' + e.message); }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-ghost';
        deleteBtn.innerText = 'Delete';
        deleteBtn.addEventListener('click', async () => {
            if (!confirm('Delete this signature? This cannot be undone.')) return;
            try {
                // remove storage file if exists
                if (data.signatureURL) {
                    try { await firebase.storage().refFromURL(data.signatureURL).delete(); } catch (e) { console.warn('Failed to delete storage file:', e.message); }
                }
                await refs.signatures.child(key).remove();
                const el = incomingList.querySelector(`[data-key="${key}"]`);
                if (el) el.remove();
                renderedKeys.delete(key);
            } catch (e) { alert('Failed to delete: ' + e.message); }
        });

        right.appendChild(viewBtn);
        right.appendChild(downloadSig);
        right.appendChild(deleteBtn);

        card.appendChild(left);
        card.appendChild(right);

        if (prepend) incomingList.prepend(card);
        else incomingList.appendChild(card);

        renderedKeys.add(key);
        return card;
    }

    async function loadInitialSignatures() {
        const snap = await refs.signatures.orderByKey().limitToLast(PAGE_SIZE).once('value');
        const items = [];
        snap.forEach(ch => items.push({ key: ch.key, val: ch.val() }));
        // sort ascending by key (oldest -> newest)
        items.sort((a,b) => a.key.localeCompare(b.key));
        for (const it of items) {
            createSignatureCard(it.key, it.val(), true);
        }
        if (items.length) {
            earliestKey = items[0].key;
            newestKey = items[items.length-1].key;
        }
    }

    // Load more button
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'btn outline';
    loadMoreBtn.innerText = 'Load more signatures';
    loadMoreBtn.style.marginBottom = '12px';
    loadMoreBtn.addEventListener('click', async () => {
        if (!earliestKey) return alert('No more signatures to load');
        // fetch older than earliestKey
        const snap = await refs.signatures.orderByKey().endAt(earliestKey).limitToLast(PAGE_SIZE + 1).once('value');
        const items = [];
        snap.forEach(ch => items.push({ key: ch.key, val: ch.val() }));
        // remove duplicate earliestKey
        items.sort((a,b) => a.key.localeCompare(b.key));
        // remove last item if it's the same as earliestKey
        if (items.length && items[items.length-1].key === earliestKey) items.pop();
        if (!items.length) return alert('No older signatures');
        for (const it of items) {
            createSignatureCard(it.key, it.val(), false); // append older items at bottom
        }
        earliestKey = items[0].key;
    });

    incomingList.parentNode.insertBefore(loadMoreBtn, incomingList);

    // listen for newly added signatures (live)
    refs.signatures.limitToLast(1).on('child_added', snapshot => {
        // if we already rendered this key, skip
        if (renderedKeys.has(snapshot.key)) return;
        // new item -> prepend
        createSignatureCard(snapshot.key, snapshot.val(), true);
        newestKey = snapshot.key;
    });

    // listen for removed signatures to update UI
    refs.signatures.on('child_removed', snapshot => {
        const el = incomingList.querySelector(`[data-key="${snapshot.key}"]`);
        if (el) el.remove();
        renderedKeys.delete(snapshot.key);
    });

    // initial load
    loadInitialSignatures();

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

    // Poster upload UI handling
    const posterInput = document.getElementById('posterInput');
    const uploadPoster = document.getElementById('uploadPoster');
    const currentPoster = document.getElementById('current-poster');
    const downloadPosterFile = document.getElementById('downloadPosterFile');

    // show poster if exists
    refs.poster.on('value', snap => {
        const val = snap.val();
        if (val && val.url) {
            currentPoster.src = val.url;
            currentPoster.style.display = 'block';
            downloadPosterFile.classList.remove('hidden');
            downloadPosterFile.onclick = () => {
                const a = document.createElement('a');
                a.href = val.url;
                a.download = val.name || 'invitation_poster.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
            };
            deletePosterFile.classList.remove('hidden');
            deletePosterFile.onclick = async () => {
                if (!confirm('Delete the current poster? This will remove it for all users.')) return;
                try {
                    if (val.url) {
                        try { await firebase.storage().refFromURL(val.url).delete(); } catch (e) { console.warn('Failed to delete poster from storage', e.message); }
                    }
                    await refs.poster.remove();
                    alert('Poster removed');
                } catch (e) { alert('Failed to delete poster: ' + e.message); }
            };
        } else {
            currentPoster.src = '';
            currentPoster.style.display = 'none';
            downloadPosterFile.classList.add('hidden');
            deletePosterFile.classList.add('hidden');
        }
    });

    uploadPoster.addEventListener('click', async () => {
        const file = posterInput.files && posterInput.files[0];
        if (!file) return alert('Please choose an image file first.');
        try {
            const storageRef = firebase.storage().ref();
            const path = `posters/${Date.now()}_${file.name}`;
            const snap = await storageRef.child(path).put(file);
            const url = await snap.ref.getDownloadURL();
            const time = new Date().toLocaleString();
            await refs.poster.set({ url, name: file.name, time });
            alert('Poster uploaded and saved.');
            posterInput.value = '';
        } catch (e) { alert('Upload failed: ' + e.message); }
    });
}