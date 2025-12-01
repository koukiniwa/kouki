// バックエンド API エンドポイント
const API_ENDPOINT = 'https://ai-kouki-backend-610abb7fb0bc.herokuapp.com/api/chat';

// 会話履歴
let conversationHistory = [];

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
        
        // AIの返答を表示
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