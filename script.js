// Parse URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const authorityName = urlParams.get('name') || 'Honorable Guest';

// Logic for sign.html
if (window.location.pathname.includes('sign.html')) {
    document.getElementById('authName').innerText = `Welcome, ${authorityName}`;
    const canvas = document.getElementById('signature-pad');
    window.signaturePad = new SignaturePad(canvas);

    window.submitSignature = function() {
        if (signaturePad.isEmpty()) return alert("Please provide a signature.");
        
        const dataURL = signaturePad.toDataURL(); // Base64 image
        const timestamp = new Date().toLocaleString();

        // Push to Firebase Realtime Database
        db.ref('signatures').push({
            name: authorityName,
            signature: dataURL,
            time: timestamp
        }).then(() => {
            // Show Poster
            document.getElementById('sign-section').classList.add('hidden');
            document.getElementById('poster-section').classList.remove('hidden');
            document.getElementById('poster-name').innerText = authorityName;
            document.getElementById('poster-sig').src = dataURL;
        }).catch(err => alert("Error saving data: " + err));
    };
}

// Logic for admin.html
if (window.location.pathname.includes('admin.html')) {
    const list = document.getElementById('incoming-list');
    
    // Listen for new entries in real-time
    db.ref('signatures').on('child_added', (snapshot) => {
        const data = snapshot.val();
        
        const card = document.createElement('div');
        card.innerHTML = `<p><b>${data.name}</b> signed at ${data.time}</p>`;
        
        const printBtn = document.createElement('button');
        printBtn.innerText = `Print Invitation`;
        printBtn.onclick = () => printReceipt(data.name, data.signature, data.time);
        
        card.appendChild(printBtn);
        card.appendChild(document.createElement('hr'));
        list.prepend(card); // Show newest first
    });

    window.printReceipt = function(name, sigURL, time) {
        document.getElementById('print-area').classList.remove('hidden');
        document.getElementById('print-name').innerText = name;
        document.getElementById('print-sig').src = sigURL;
        document.getElementById('print-date').innerText = time;
        
        window.print(); // Triggers browser print dialog (select Bluetooth printer here)
        
        document.getElementById('print-area').classList.add('hidden');
    };
}