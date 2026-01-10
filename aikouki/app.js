// ===== 3Dアバター関連 =====
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// グローバル変数
let scene, camera, renderer, vrm, currentVrm;
let clock = new THREE.Clock();
let isBlinking = false;
let isSpeaking = false;
let blinkTimer = 0;
let speakTimer = 0;
let breathTimer = 0;
let idleTimer = 0;

// VRMアバターの初期化
async function initAvatar() {
    const canvas = document.getElementById('avatar-canvas');

    // レンダラー設定
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });
    renderer.setSize(400, 500);
    renderer.setPixelRatio(window.devicePixelRatio);

    // シーン作成
    scene = new THREE.Scene();

    // カメラ設定（腰より上が見えるように調整）
    camera = new THREE.PerspectiveCamera(35, 400 / 500, 0.1, 20);
    camera.position.set(0, 1.0, 1.5);  // より近く、低めに
    camera.lookAt(0, 1.0, 0);

    // ライト設定
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // VRMモデル読み込み
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    try {
        const gltf = await loader.loadAsync('コウキ.vrm');
        vrm = gltf.userData.vrm;
        currentVrm = vrm;

        // VRMモデルをシーンに追加
        VRMUtils.removeUnnecessaryJoints(vrm.scene);
        scene.add(vrm.scene);

        // 初期表情を設定（ニュートラル）
        setExpression('neutral');

        // 腕のポーズはupdateIdle関数で自動的に設定されます

        console.log('VRMアバター読み込み完了');
    } catch (error) {
        console.error('VRMアバター読み込みエラー:', error);
    }

    // アニメーションループ
    animate();
}

// 瞬きアニメーション
function updateBlink(deltaTime) {
    if (!currentVrm || !currentVrm.expressionManager) return;

    blinkTimer += deltaTime;

    // 3-5秒ごとに瞬き
    if (blinkTimer > 3 + Math.random() * 2) {
        if (!isBlinking) {
            isBlinking = true;
            currentVrm.expressionManager.setValue('blink', 1.0);

            setTimeout(() => {
                if (currentVrm && currentVrm.expressionManager) {
                    currentVrm.expressionManager.setValue('blink', 0);
                    isBlinking = false;
                }
            }, 150);

            blinkTimer = 0;
        }
    }
}

// リップシンク（口パク）アニメーション
function updateLipSync(deltaTime) {
    if (!currentVrm || !currentVrm.expressionManager || !isSpeaking) return;

    speakTimer += deltaTime;

    // 口の開閉をアニメーション（波のように）
    const mouthValue = Math.abs(Math.sin(speakTimer * 10)) * 0.6;

    try {
        currentVrm.expressionManager.setValue('aa', mouthValue);
    } catch (error) {
        // aa表情がない場合は無視
    }
}

// 話し始める
function startSpeaking() {
    isSpeaking = true;
    speakTimer = 0;
}

// 話し終わる
function stopSpeaking() {
    isSpeaking = false;
    if (currentVrm && currentVrm.expressionManager) {
        try {
            currentVrm.expressionManager.setValue('aa', 0);
        } catch (error) {
            // 無視
        }
    }
}

// 体の揺れアニメーション（より自然に）
function updateBreathing(deltaTime) {
    if (!currentVrm) return;

    breathTimer += deltaTime;

    // ゆっくりとした左右の揺れ（4秒周期）
    const swayCycle = Math.sin(breathTimer * 1.5) * 0.015;

    // 前後の微妙な揺れ（5秒周期）
    const forwardCycle = Math.sin(breathTimer * 1.2) * 0.01;

    // VRMモデル全体を左右に揺らす
    if (currentVrm.scene) {
        currentVrm.scene.position.x = swayCycle;
        currentVrm.scene.position.z = forwardCycle;

        // 体も少し回転させる
        currentVrm.scene.rotation.y = swayCycle * 0.5;
    }
}

// アイドルアニメーション（首と腕の微妙な動き）
function updateIdle(deltaTime) {
    if (!currentVrm || !currentVrm.humanoid) return;

    idleTimer += deltaTime;

    const humanoid = currentVrm.humanoid;

    try {
        const head = humanoid.getNormalizedBoneNode('head');

        if (head) {
            // ゆっくりと首を左右に振る（6秒周期）
            const headYaw = Math.sin(idleTimer * 0.5) * 0.08;
            // ゆっくりと首を上下に振る（8秒周期）
            const headPitch = Math.sin(idleTimer * 0.4) * 0.04;

            head.rotation.y = headYaw;
            head.rotation.x = headPitch;
        }

        // 腕の自然な揺れ
        const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
        const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
        const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');

        // 左腕の微妙な揺れ（7秒周期）
        const leftArmSway = Math.sin(idleTimer * 0.9) * 0.03;
        if (leftUpperArm) {
            leftUpperArm.rotation.x = leftArmSway;
            leftUpperArm.rotation.z = -1.2 + leftArmSway * 0.5; // 基本ポーズ + 揺れ
        }
        if (leftLowerArm) {
            leftLowerArm.rotation.z = 0.15 + Math.sin(idleTimer * 0.8) * 0.02;
        }

        // 右腕の微妙な揺れ（8秒周期、左腕とずらす）
        const rightArmSway = Math.sin(idleTimer * 0.85 + 1.5) * 0.03;
        if (rightUpperArm) {
            rightUpperArm.rotation.x = rightArmSway;
            rightUpperArm.rotation.z = 1.2 + rightArmSway * 0.5; // 基本ポーズ + 揺れ
        }
        if (rightLowerArm) {
            rightLowerArm.rotation.z = -0.15 + Math.sin(idleTimer * 0.75 + 1.0) * 0.02;
        }

    } catch (error) {
        console.log('アイドルアニメーションエラー:', error);
    }
}

// アニメーションループ
let frameCount = 0;
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    if (currentVrm) {
        currentVrm.update(deltaTime);

        // すべてのアニメーションを更新
        updateBlink(deltaTime);
        updateLipSync(deltaTime);
        updateBreathing(deltaTime);
        updateIdle(deltaTime);

        // デバッグログは削除（動作確認後）
    }

    renderer.render(scene, camera);
}

// 表情を変更する関数
function setExpression(expressionName) {
    if (!currentVrm) return;

    const expressionManager = currentVrm.expressionManager;
    if (!expressionManager) return;

    // 全ての表情をリセット
    expressionManager.expressions.forEach(expression => {
        expressionManager.setValue(expression.expressionName, 0);
    });

    // 表情マッピング（VRMの標準表情名）
    const expressionMap = {
        'neutral': 'neutral',
        'happy': 'happy',
        'sad': 'sad',
        'angry': 'angry',
        'surprised': 'surprised',
        'relaxed': 'relaxed'
    };

    const vrmExpressionName = expressionMap[expressionName] || 'neutral';

    // 指定された表情を設定
    try {
        expressionManager.setValue(vrmExpressionName, 1.0);
        console.log(`表情変更: ${expressionName}`);
    } catch (error) {
        console.log('表情設定エラー:', error);
    }
}

// 感情を分析する関数
function analyzeEmotion(text) {
    // 簡易的な感情分析（キーワードベース）
    const emotions = {
        happy: ['嬉しい', '楽しい', '最高', 'よかった', 'ありがとう', 'わーい', 'やった', '！'],
        sad: ['悲しい', '辛い', 'しんどい', '残念', '寂しい'],
        angry: ['怒', 'むかつく', 'イライラ'],
        surprised: ['まじか', 'えっ', '驚', 'すごい', 'マジ'],
        relaxed: ['まぁ', 'ねー', 'かも', 'だろうね']
    };

    for (const [emotion, keywords] of Object.entries(emotions)) {
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                return emotion;
            }
        }
    }

    return 'neutral';
}

// ページ読み込み時にアバター初期化とイベントリスナー設定
window.addEventListener('DOMContentLoaded', () => {
    initAvatar();

    // イベントリスナーを設定
    const sendButton = document.getElementById('sendButton');
    const userInput = document.getElementById('userInput');
    const micButton = document.getElementById('micButton');

    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }

    if (userInput) {
        userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                sendMessage();
            }
        });
    }

    if (micButton) {
        micButton.addEventListener('click', toggleVoiceRecognition);
    }
});

// ===== 既存のチャット機能 =====
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

        // 再生開始時にリップシンク開始
        audio.onplay = () => {
            startSpeaking();
        };

        // 再生終了時にボタンを元に戻す＆リップシンク停止
        audio.onended = () => {
            stopSpeaking();
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

        // 感情分析して表情を変更
        const emotion = analyzeEmotion(data.reply);
        setExpression(emotion);

        // 返答時に少しリップシンクを動かす（会話している感じ）
        startSpeaking();
        const speakDuration = Math.min(data.reply.length * 100, 3000); // 文字数に応じて調整、最大3秒
        setTimeout(() => {
            stopSpeaking();
        }, speakDuration);

        // 3秒後にニュートラルに戻す
        setTimeout(() => {
            setExpression('neutral');
        }, 3000);

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