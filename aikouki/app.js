// バックエンド API エンドポイント
const API_ENDPOINT = 'https://ai-kouki-backend-610abb7fb0bc.herokuapp.com/api/chat';

// 会話履歴
let conversationHistory = [];

// 音声認識の設定
let recognition = null;
let isListening = false;

// Web Speech API の初期化
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('userInput').value = transcript;
        sendMessage();
    };

    recognition.onerror = (event) => {
        console.error('音声認識エラー:', event.error);
        stopListening();
        if (event.error === 'no-speech') {
            addMessageToChat('音声が聞こえませんでした。もう一度試してください。', 'ai');
        }
    };

    recognition.onend = () => {
        stopListening();
    };
}

// 音声認識の開始/停止
function toggleVoiceRecognition() {
    if (!recognition) {
        alert('お使いのブラウザは音声認識に対応していません。Chrome または Edge をお使いください。');
        return;
    }

    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

function startListening() {
    if (!recognition || isListening) return;

    try {
        recognition.start();
        isListening = true;
        const micButton = document.getElementById('micButton');
        micButton.classList.add('listening');
        micButton.textContent = '⏹️';
    } catch (error) {
        console.error('音声認識開始エラー:', error);
    }
}

function stopListening() {
    if (!recognition || !isListening) return;

    try {
        recognition.stop();
    } catch (error) {
        console.error('音声認識停止エラー:', error);
    }

    isListening = false;
    const micButton = document.getElementById('micButton');
    micButton.classList.remove('listening');
    micButton.textContent = '🎤';
}

// 音声再生機能（バックエンドAPIを使用）
async function playVoice(text, button) {
    const TTS_ENDPOINT = 'https://ai-kouki-backend-610abb7fb0bc.herokuapp.com/api/tts';

    try {
        // ボタンの状態を変更（ローディング表示）
        if (button) {
            button.disabled = true;
            button.textContent = '⏳';
        }

        const response = await fetch(TTS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text })
        });

        if (!response.ok) throw new Error('音声生成エラー');

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        // 再生終了時にボタンを元に戻す
        audio.onended = () => {
            if (button) {
                button.disabled = false;
                button.textContent = '🔊';
            }
        };

        await audio.play();

        // 再生中はボタンを停止アイコンに
        if (button) {
            button.textContent = '▶️';
        }
    } catch (error) {
        console.error('音声再生エラー:', error);
        if (button) {
            button.disabled = false;
            button.textContent = '🔊';
        }
        alert('音声再生に失敗しました');
    }
}

async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();

    if (!message) return;

    // ユーザーメッセージを表示
    addMessageToChat(message, 'user');
    conversationHistory.push({ role: 'user', content: message });
    userInput.value = '';

    // ローディング表示
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message ai-message';
    loadingDiv.innerHTML = '<p>考え中...</p>';
    document.getElementById('chatMessages').appendChild(loadingDiv);
    document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;

    try {
        // バックエンド API に送信
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                conversationHistory: conversationHistory
            })
        });

        if (!response.ok) {
            throw new Error('API エラー');
        }

        const data = await response.json();
        
        // ローディングを削除
        loadingDiv.remove();
        
        // AIの返答を表示（音声ボタン付き）
        addMessageToChat(data.reply, 'ai');
        conversationHistory.push({ role: 'assistant', content: data.reply });

    } catch (error) {
        console.error('エラー:', error);
        loadingDiv.remove();
        addMessageToChat('申し訳ない。何かエラーが起きた。', 'ai');
    }
}

function addMessageToChat(message, sender) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const p = document.createElement('p');
    p.textContent = message;
    messageDiv.appendChild(p);

    // AIメッセージの場合は音声再生ボタンを追加
    if (sender === 'ai') {
        const voiceButton = document.createElement('button');
        voiceButton.className = 'voice-button';
        voiceButton.textContent = '🔊';
        voiceButton.title = '音声で聞く';
        voiceButton.onclick = function() {
            playVoice(message, voiceButton);
        };
        messageDiv.appendChild(voiceButton);
    }

    chatMessages.appendChild(messageDiv);

    // 下にスクロール
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messageDiv;
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}