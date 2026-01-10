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
let voiceEnabled = true; // 音声のオン/オフ（デフォルトはオン）
let isTiltingHead = false; // 首を傾げているかどうか
let tiltTimer = 0;
let hasGreeted = false; // 初回挨拶済みかどうか
let randomGestureTimer = 0; // ランダムジェスチャーのタイマー
let nextGestureTime = 10 + Math.random() * 10; // 次のジェスチャーまでの時間（10-20秒）
let currentGesture = null; // 現在実行中のジェスチャー
let gestureProgress = 0; // ジェスチャーの進行度

// VRMアバターの初期化
async function initAvatar() {
    const canvas = document.getElementById('avatar-canvas');

    // キャンバスサイズを取得（レスポンシブ対応）
    const canvasWidth = canvas.clientWidth || window.innerWidth;
    const canvasHeight = canvas.clientHeight || window.innerHeight;

    // レンダラー設定
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // シーン作成
    scene = new THREE.Scene();

    // カメラ設定（足まで見えるように）
    camera = new THREE.PerspectiveCamera(40, canvasWidth / canvasHeight, 0.1, 20);
    camera.position.set(0, 0.9, 3.2);
    camera.lookAt(0, 0.9, 0);

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
        const gltf = await loader.loadAsync('./コウキ.vrm');
        vrm = gltf.userData.vrm;
        currentVrm = vrm;

        // VRMモデルをシーンに追加
        VRMUtils.removeUnnecessaryJoints(vrm.scene);
        scene.add(vrm.scene);

        // 肌の色をきれいな肌色に調整（テクスチャベース）
        vrm.scene.traverse((object) => {
            if (object.isMesh && object.material) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach((material) => {
                    console.log('マテリアル:', material.name, 'タイプ:', material.type);

                    // テクスチャがある場合、キャンバスできれいな肌色に調整
                    if (material.map && material.map.image) {
                        const texture = material.map;
                        const image = texture.image;

                        // 画像が完全に読み込まれているか確認
                        if (!image.complete || image.width === 0) {
                            console.log('画像が未ロード:', material.name);
                            return;
                        }

                        try {
                            // キャンバスを作成してテクスチャを調整
                            const canvas = document.createElement('canvas');
                            canvas.width = image.width;
                            canvas.height = image.height;
                            const ctx = canvas.getContext('2d');

                            // 画像を描画
                            ctx.drawImage(image, 0, 0);

                            // ピクセルデータを取得
                            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                            const data = imageData.data;

                            // 各ピクセルをきれいな肌色に調整
                            for (let i = 0; i < data.length; i += 4) {
                                // 赤みを保ちながら明るくする（健康的な肌色）
                                // R（赤）は強めに明るく
                                data[i] = Math.min(data[i] * 1.3 + 50, 255);
                                // G（緑）は中程度に明るく
                                data[i + 1] = Math.min(data[i + 1] * 1.2 + 40, 255);
                                // B（青）は控えめに（青白さを防ぐ）
                                data[i + 2] = Math.min(data[i + 2] * 1.1 + 30, 255);
                                // Alpha（透明度）は変更しない
                            }

                            // 明るくした画像データを戻す
                            ctx.putImageData(imageData, 0, 0);

                            // 新しいテクスチャとして設定
                            const newTexture = new THREE.CanvasTexture(canvas);
                            newTexture.colorSpace = texture.colorSpace;
                            newTexture.flipY = texture.flipY;
                            material.map = newTexture;
                            material.needsUpdate = true;

                            console.log('✅ テクスチャをきれいな肌色に調整:', material.name);
                        } catch (error) {
                            console.error('テクスチャ調整エラー:', material.name, error);
                        }
                    }

                    // 追加で暖色系の発光色を設定（健康的な肌の色）
                    if (material.emissive) {
                        material.emissive.setRGB(0.2, 0.15, 0.1); // ピーチ系の色
                        material.emissiveIntensity = 0.8;
                        material.needsUpdate = true;
                    }
                });
            }
        });

        // 初期表情を設定（ニュートラル）
        setExpression('neutral');

        console.log('VRMアバター読み込み完了');

        // 初回挨拶（1秒後に実行）
        setTimeout(() => {
            playGreeting();
        }, 1000);
    } catch (error) {
        console.error('VRMアバター読み込みエラー:', error);
    }

    // アニメーションループ
    animate();

    // ウィンドウリサイズ対応
    window.addEventListener('resize', () => {
        const width = canvas.clientWidth || window.innerWidth;
        const height = canvas.clientHeight || window.innerHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });
}

// 瞬きアニメーション
function updateBlink(deltaTime) {
    if (!currentVrm || !currentVrm.expressionManager) return;

    blinkTimer += deltaTime;

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

// 体の揺れアニメーション
function updateBreathing(deltaTime) {
    if (!currentVrm) return;

    breathTimer += deltaTime;

    const swayCycle = Math.sin(breathTimer * 1.5) * 0.015;
    const forwardCycle = Math.sin(breathTimer * 1.2) * 0.01;

    if (currentVrm.scene) {
        currentVrm.scene.position.x = swayCycle;
        currentVrm.scene.position.z = forwardCycle;
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
            const headYaw = Math.sin(idleTimer * 0.5) * 0.08;
            const headPitch = Math.sin(idleTimer * 0.4) * 0.04;

            head.rotation.y = headYaw;
            head.rotation.x = headPitch;
        }

        // 腕の自然な揺れ
        const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
        const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
        const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');

        const leftArmSway = Math.sin(idleTimer * 0.9) * 0.03;
        if (leftUpperArm) {
            leftUpperArm.rotation.x = leftArmSway;
            leftUpperArm.rotation.z = -1.2 + leftArmSway * 0.5;
        }
        if (leftLowerArm) {
            leftLowerArm.rotation.z = 0.15 + Math.sin(idleTimer * 0.8) * 0.02;
        }

        const rightArmSway = Math.sin(idleTimer * 0.85 + 1.5) * 0.03;
        if (rightUpperArm) {
            rightUpperArm.rotation.x = rightArmSway;
            rightUpperArm.rotation.z = 1.2 + rightArmSway * 0.5;
        }
        if (rightLowerArm) {
            rightLowerArm.rotation.z = -0.15 + Math.sin(idleTimer * 0.75 + 1.0) * 0.02;
        }

    } catch (error) {
        console.log('アイドルアニメーションエラー:', error);
    }
}

// 首を傾げるアニメーション
function updateHeadTilt(deltaTime) {
    if (!currentVrm || !currentVrm.humanoid || !isTiltingHead) return;

    tiltTimer += deltaTime;
    const humanoid = currentVrm.humanoid;

    try {
        const head = humanoid.getNormalizedBoneNode('head');

        if (head) {
            // 首を左右に傾げる動き
            // 0秒: 右に傾げる → 1秒: まっすぐ → 2秒: 左に傾げる → 3秒: まっすぐ
            if (tiltTimer < 1) {
                // 右に傾げる
                head.rotation.z = -0.35 * (1 - Math.abs(1 - tiltTimer * 2));
            } else if (tiltTimer < 2) {
                // 左に傾げる
                head.rotation.z = 0.35 * (1 - Math.abs(1 - (tiltTimer - 1) * 2));
            } else if (tiltTimer < 3) {
                // まっすぐに戻る
                head.rotation.z = -0.35 * (tiltTimer - 2);
            } else {
                // 3秒後に停止
                isTiltingHead = false;
                tiltTimer = 0;
                head.rotation.z = 0;
            }
        }

    } catch (error) {
        console.log('首を傾げるアニメーションエラー:', error);
    }
}

// ランダムなジェスチャーを開始
function startRandomGesture() {
    if (isTiltingHead || isSpeaking) return; // 話している時やすでに動作中はスキップ

    const gestures = ['headTilt', 'armRaise', 'bodyLean'];
    currentGesture = gestures[Math.floor(Math.random() * gestures.length)];
    gestureProgress = 0;
}

// ランダムジェスチャーのアニメーション更新
function updateRandomGesture(deltaTime) {
    if (!currentVrm || !currentVrm.humanoid || !currentGesture) return;

    gestureProgress += deltaTime;
    const humanoid = currentVrm.humanoid;

    try {
        if (currentGesture === 'headTilt') {
            // 軽く首を傾げる（1.5秒）
            const head = humanoid.getNormalizedBoneNode('head');
            if (head) {
                const direction = Math.random() > 0.5 ? 1 : -1; // 左右ランダム
                if (gestureProgress < 0.75) {
                    head.rotation.z = direction * 0.2 * Math.sin(gestureProgress * Math.PI / 0.75);
                } else if (gestureProgress < 1.5) {
                    head.rotation.z = direction * 0.2 * Math.sin((1.5 - gestureProgress) * Math.PI / 0.75);
                } else {
                    head.rotation.z = 0;
                    currentGesture = null;
                }
            }
        } else if (currentGesture === 'armRaise') {
            // 片腕を少し上げる（2秒）
            const arm = Math.random() > 0.5 ?
                humanoid.getNormalizedBoneNode('rightUpperArm') :
                humanoid.getNormalizedBoneNode('leftUpperArm');

            if (arm) {
                const baseRotation = arm === humanoid.getNormalizedBoneNode('rightUpperArm') ? 1.2 : -1.2;
                if (gestureProgress < 1.0) {
                    arm.rotation.x = -0.3 * Math.sin(gestureProgress * Math.PI);
                } else if (gestureProgress < 2.0) {
                    arm.rotation.x = -0.3 * Math.sin((2.0 - gestureProgress) * Math.PI);
                } else {
                    arm.rotation.x = 0;
                    currentGesture = null;
                }
            }
        } else if (currentGesture === 'bodyLean') {
            // 体を軽く傾ける（2秒）
            if (currentVrm.scene && gestureProgress < 2.0) {
                const direction = Math.random() > 0.5 ? 1 : -1;
                const leanAmount = 0.02 * Math.sin(gestureProgress * Math.PI / 2.0);
                currentVrm.scene.rotation.z = direction * leanAmount;
            } else {
                if (currentVrm.scene) {
                    currentVrm.scene.rotation.z = 0;
                }
                currentGesture = null;
            }
        }
    } catch (error) {
        console.log('ランダムジェスチャーエラー:', error);
        currentGesture = null;
    }
}

// ランダムジェスチャータイマー更新
function updateRandomGestureTimer(deltaTime) {
    // 挨拶が終わってから開始
    if (!hasGreeted) return;

    randomGestureTimer += deltaTime;

    if (randomGestureTimer >= nextGestureTime && !currentGesture) {
        startRandomGesture();
        randomGestureTimer = 0;
        nextGestureTime = 10 + Math.random() * 10; // 次は10-20秒後
    }

    if (currentGesture) {
        updateRandomGesture(deltaTime);
    }
}

// アニメーションループ
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    if (currentVrm) {
        currentVrm.update(deltaTime);
        updateBlink(deltaTime);
        updateLipSync(deltaTime);
        updateBreathing(deltaTime);

        // 首を傾げているときはアイドルアニメーションの頭の動きをスキップ
        if (isTiltingHead) {
            updateHeadTilt(deltaTime);
        } else if (currentGesture) {
            // ランダムジェスチャー実行中はアイドルアニメーションをスキップ
            updateRandomGesture(deltaTime);
        } else {
            updateIdle(deltaTime);
        }

        // ランダムジェスチャータイマーを常に更新
        updateRandomGestureTimer(deltaTime);
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

    // 表情マッピング
    const expressionMap = {
        'neutral': 'neutral',
        'happy': 'happy',
        'sad': 'sad',
        'angry': 'angry',
        'surprised': 'surprised',
        'relaxed': 'relaxed'
    };

    const vrmExpressionName = expressionMap[expressionName] || 'neutral';

    try {
        expressionManager.setValue(vrmExpressionName, 1.0);
        console.log(`表情変更: ${expressionName}`);
    } catch (error) {
        console.log('表情設定エラー:', error);
    }
}

// 感情を分析する関数
function analyzeEmotion(text) {
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

// ===== 既存のチャット機能 =====
const API_ENDPOINT = 'https://ai-kouki-backend-610abb7fb0bc.herokuapp.com/api/chat';
let conversationHistory = [];
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
    };

    recognition.onend = () => {
        stopListening();
    };
}

// 音声認識の開始/停止
function toggleVoiceRecognition() {
    if (!recognition) {
        alert('お使いのブラウザは音声認識に対応していません。');
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

// 音声再生機能
async function playVoice(text) {
    const TTS_ENDPOINT = 'https://ai-kouki-backend-610abb7fb0bc.herokuapp.com/api/tts';

    try {
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

        // 再生終了時にリップシンク停止
        audio.onended = () => {
            stopSpeaking();
        };

        await audio.play();

    } catch (error) {
        console.error('音声再生エラー:', error);
    }
}

// 初回挨拶を実行する関数
async function playGreeting() {
    if (hasGreeted) return;
    hasGreeted = true;

    const greetingMessage = 'やー、こんにちは！何か話しかけてください。';

    // 表情を笑顔に
    setExpression('happy');

    // 首を傾げるアニメーション開始
    isTiltingHead = true;
    tiltTimer = 0;

    // 初回は吹き出しで表示（自動再生ポリシー回避）
    showSpeechBubble(greetingMessage);

    // リップシンク開始
    startSpeaking();
    setTimeout(() => {
        stopSpeaking();
    }, 3000);

    // 3.5秒後にニュートラルに戻す
    setTimeout(() => {
        setExpression('neutral');
        // 吹き出しも非表示（音声オンの場合のみ）
        if (voiceEnabled) {
            hideSpeechBubble();
        }
    }, 3500);
}

// 吹き出しを表示する関数
function showSpeechBubble(text) {
    const bubble = document.getElementById('speechBubble');
    const bubbleText = document.getElementById('bubbleText');

    bubbleText.textContent = text;
    bubble.classList.remove('hidden');
}

// 吹き出しを非表示にする関数
function hideSpeechBubble() {
    const bubble = document.getElementById('speechBubble');
    bubble.classList.add('hidden');
}

// メッセージ送信
async function sendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();

    if (!message) return;

    // 会話履歴に追加
    conversationHistory.push({ role: 'user', content: message });
    userInput.value = '';

    // 音声オフの場合、ローディング表示
    if (!voiceEnabled) {
        showSpeechBubble('考え中...');
    }

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

        // 会話履歴に追加
        conversationHistory.push({ role: 'assistant', content: data.reply });

        // 感情分析して表情を変更
        const emotion = analyzeEmotion(data.reply);
        setExpression(emotion);

        // 音声オン/オフで処理を分岐
        if (voiceEnabled) {
            // 音声オン：音声再生のみ（吹き出し非表示）
            hideSpeechBubble();
            await playVoice(data.reply);
        } else {
            // 音声オフ：吹き出しで表示（音声なし）
            showSpeechBubble(data.reply);
            // 吹き出し表示中も軽くリップシンク
            startSpeaking();
            const speakDuration = Math.min(data.reply.length * 100, 3000);
            setTimeout(() => {
                stopSpeaking();
            }, speakDuration);
        }

        // 3秒後にニュートラルに戻す
        setTimeout(() => {
            setExpression('neutral');
        }, 3000);

    } catch (error) {
        console.error('エラー:', error);
        if (!voiceEnabled) {
            showSpeechBubble('申し訳ない。何かエラーが起きた。');
        }
    }
}

// 音声トグルボタンの表示を更新
function updateVoiceButton() {
    const voiceToggle = document.getElementById('voiceToggle');
    if (voiceToggle) {
        if (voiceEnabled) {
            voiceToggle.textContent = '🔊';
            voiceToggle.classList.remove('voice-off');
            voiceToggle.title = '音声: オン';
        } else {
            voiceToggle.textContent = '🔇';
            voiceToggle.classList.add('voice-off');
            voiceToggle.title = '音声: オフ';
        }
    }
}

// ページ読み込み時にアバター初期化とイベントリスナー設定
window.addEventListener('DOMContentLoaded', () => {
    initAvatar();

    // localStorageから音声設定を読み込み
    const savedVoice = localStorage.getItem('voiceEnabled');
    if (savedVoice === 'false') {
        voiceEnabled = false;
    }

    // 音声トグルボタンの初期状態を設定
    updateVoiceButton();

    // イベントリスナーを設定
    const sendButton = document.getElementById('sendButton');
    const userInput = document.getElementById('userInput');
    const micButton = document.getElementById('micButton');
    const voiceToggle = document.getElementById('voiceToggle');

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

    if (voiceToggle) {
        voiceToggle.addEventListener('click', () => {
            voiceEnabled = !voiceEnabled;
            localStorage.setItem('voiceEnabled', voiceEnabled.toString());
            updateVoiceButton();

            // 音声オンにした場合、吹き出しを非表示
            if (voiceEnabled) {
                hideSpeechBubble();
            }
        });
    }
});
