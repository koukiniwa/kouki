// ===== 3Dアバター関連 =====
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

// グローバル変数
let scene, camera, renderer, vrm, currentVrm;
let clock = new THREE.Clock();
let isBlinking = false;
let isSpeaking = false;
let blinkTimer = 0;
let speakTimer = 0;
let breathTimer = 0;
let idleTimer = 0;
let isTiltingHead = false; // 首を傾げているかどうか
let tiltTimer = 0;
let hasGreeted = false; // 初回挨拶済みかどうか
let randomGestureTimer = 0; // ランダムジェスチャーのタイマー
let nextGestureTime = 10 + Math.random() * 10; // 次のジェスチャーまでの時間（10-20秒）
let currentGesture = null; // 現在実行中のジェスチャー
let gestureProgress = 0; // ジェスチャーの進行度
let gestureDirection = 1; // ジェスチャーの方向（1 or -1）
let gestureTarget = null; // ジェスチャーのターゲット（腕など）
let mouseX = 0; // マウスX座標（-1 to 1）
let mouseY = 0; // マウスY座標（-1 to 1）
let expressionTimer = 0; // 表情変化タイマー
let nextExpressionTime = 5 + Math.random() * 5; // 次の表情変化までの時間（5-10秒）
let currentEmotion = 'neutral'; // 現在の感情
let mixer = null; // AnimationMixer
let animationAction = null; // 現在再生中のアニメーション
let useExternalAnimation = false; // 外部アニメーション使用フラグ
let animationClips = []; // 読み込んだアニメーションクリップ一覧
let animSwitchTimer = 0; // アニメーション切り替えタイマー
let nextAnimSwitchTime = 8 + Math.random() * 7; // 次の切り替えまでの時間（8〜15秒）

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
    camera = new THREE.PerspectiveCamera(45, canvasWidth / canvasHeight, 0.1, 20);
    camera.position.set(0, 0.9, 2.7);
    camera.lookAt(0, 0.9, 0);

    // ライト設定（自然な肌色）
    const light = new THREE.DirectionalLight(0xfff5ed, 1.8); // 暖色系で程よい明るさ
    light.position.set(1, 1, 1).normalize();
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0xfff0e8, 0.9); // 環境光を少し抑える
    scene.add(ambientLight);

    // 補助光を追加（顔を明るく）
    const fillLight = new THREE.DirectionalLight(0xffeedd, 0.6);
    fillLight.position.set(-1, 0.5, 1).normalize();
    scene.add(fillLight);

    // VRMモデル読み込み
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    try {
        const gltf = await loader.loadAsync('./コウキ.vrm');
        vrm = gltf.userData.vrm;
        currentVrm = vrm;

        // VRMモデルをシーンに追加
        VRMUtils.removeUnnecessaryJoints(vrm.scene);
        scene.add(vrm.scene);

        console.log('VRMモデル読み込み完了');

        // 初期表情を設定（ニュートラル）
        setExpression('neutral');

        // ローディング画面を非表示
        const loadingEl = document.getElementById('avatar-loading');
        if (loadingEl) loadingEl.style.display = 'none';

        console.log('VRMアバター読み込み完了');

        // アニメーションはバックグラウンドで並列読み込み（アバター表示をブロックしない）
        loadAllAnimations();

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

// 全アニメーションを読み込んでランダム再生を開始
async function loadAllAnimations() {
    const animFiles = ['VRMA_01.vrma', 'VRMA_02.vrma', 'VRMA_03.vrma', 'VRMA_04.vrma', 'VRMA_05.vrma', 'VRMA_06.vrma', 'VRMA_07.vrma'];
    const animLoader = new GLTFLoader();
    animLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    mixer = new THREE.AnimationMixer(currentVrm.scene);

    // 全アニメーションを並列で読み込む
    const results = await Promise.allSettled(
        animFiles.map(file => animLoader.loadAsync(`./animations/${file}`))
    );
    for (const result of results) {
        if (result.status === 'fulfilled') {
            const vrmAnimation = result.value.userData.vrmAnimations?.[0];
            if (vrmAnimation) {
                const clip = createVRMAnimationClip(vrmAnimation, currentVrm);
                animationClips.push(clip);
            }
        }
    }

    if (animationClips.length > 0) {
        useExternalAnimation = true;

        // 最初はVRMA_02（手を振る）を1回だけ再生
        const introClip = animationClips[1]; // VRMA_02
        animationClips.splice(1, 1); // ランダムローテーションから除外

        const introAction = mixer.clipAction(introClip);
        introAction.setLoop(THREE.LoopOnce, 1);
        introAction.clampWhenFinished = true;
        introAction.play();
        animationAction = introAction;

        // 終わったらランダムローテーション開始
        mixer.addEventListener('finished', () => {
            playRandomAnimation();
        });

        console.log(`${animationClips.length}個のアニメーション読み込み完了`);
    }
}

let lastAnimIndex = -1; // 直前のアニメーションindex

// ランダムにアニメーションを再生（同じものは連続しない）
function playRandomAnimation() {
    if (!mixer || animationClips.length === 0) return;

    if (animationAction) {
        animationAction.fadeOut(0.5);
    }

    let index;
    do {
        index = Math.floor(Math.random() * animationClips.length);
    } while (index === lastAnimIndex && animationClips.length > 1);
    lastAnimIndex = index;

    animationAction = mixer.clipAction(animationClips[index]);
    animationAction.setLoop(THREE.LoopOnce, 1);
    animationAction.clampWhenFinished = true;
    animationAction.reset().fadeIn(0.5).play();
}

// VRMアニメーションを読み込む関数
async function loadVRMAnimation(url) {
    if (!currentVrm) return;

    const animLoader = new GLTFLoader();
    animLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    try {
        const animGltf = await animLoader.loadAsync(url);
        const vrmAnimation = animGltf.userData.vrmAnimations?.[0];

        if (!vrmAnimation) {
            console.log('アニメーションデータが見つかりません（手動アニメーションを使用）');
            return;
        }

        // AnimationClipを作成
        const clip = createVRMAnimationClip(vrmAnimation, currentVrm);

        // AnimationMixerを作成してアクション再生
        mixer = new THREE.AnimationMixer(currentVrm.scene);
        animationAction = mixer.clipAction(clip);
        animationAction.play();

        useExternalAnimation = true;
        console.log('Mixamoアニメーション読み込み完了:', url);
    } catch (error) {
        console.log('アニメーションファイルなし。手動アニメーションを使用:', url);
        useExternalAnimation = false;
    }
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

// イージング関数（滑らかな動き）
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// 視線追従（マウスカーソルを目で追う）
function updateEyeTracking(deltaTime) {
    if (!currentVrm || !currentVrm.humanoid) return;

    const humanoid = currentVrm.humanoid;
    const leftEye = humanoid.getNormalizedBoneNode('leftEye');
    const rightEye = humanoid.getNormalizedBoneNode('rightEye');

    if (leftEye && rightEye) {
        // マウス位置に基づいて目の向きを計算
        const targetX = mouseX * 0.3; // 左右の動き（制限）
        const targetY = -mouseY * 0.2; // 上下の動き（制限）

        // スムーズに移行
        leftEye.rotation.y = THREE.MathUtils.lerp(leftEye.rotation.y, targetX, 0.1);
        leftEye.rotation.x = THREE.MathUtils.lerp(leftEye.rotation.x, targetY, 0.1);
        rightEye.rotation.y = THREE.MathUtils.lerp(rightEye.rotation.y, targetX, 0.1);
        rightEye.rotation.x = THREE.MathUtils.lerp(rightEye.rotation.x, targetY, 0.1);
    }
}

// 待機時の表情変化
function updateIdleExpression(deltaTime) {
    if (!currentVrm || !currentVrm.expressionManager || isSpeaking) return;

    expressionTimer += deltaTime;

    if (expressionTimer >= nextExpressionTime) {
        // ランダムで表情を変化
        const idleExpressions = ['neutral', 'happy', 'relaxed'];
        const randomExpression = idleExpressions[Math.floor(Math.random() * idleExpressions.length)];

        // 現在の表情と違う場合のみ変更
        if (randomExpression !== currentEmotion) {
            setExpression(randomExpression);
            currentEmotion = randomExpression;
        }

        expressionTimer = 0;
        nextExpressionTime = 5 + Math.random() * 5; // 次は5-10秒後
    }
}

// 感情に応じた動作を実行
function playEmotionalGesture(emotion) {
    if (!currentVrm || !currentVrm.humanoid || currentGesture) return;

    // 感情に応じたジェスチャーを選択
    if (emotion === 'happy') {
        // 嬉しい時：飛び跳ねる or 手を振る
        const happyGestures = ['jump', 'wave'];
        currentGesture = happyGestures[Math.floor(Math.random() * happyGestures.length)];
    } else if (emotion === 'sad') {
        // 悲しい時：肩を落とす
        currentGesture = 'shoulderDrop';
    } else if (emotion === 'surprised') {
        // 驚いた時：後ろに反る
        currentGesture = 'stepBack';
    }

    if (currentGesture) {
        gestureProgress = 0;
        const humanoid = currentVrm.humanoid;

        if (currentGesture === 'wave') {
            gestureTarget = humanoid.getNormalizedBoneNode('rightUpperArm');
        }
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
    if (isTiltingHead || isSpeaking || !currentVrm || !currentVrm.humanoid) return; // 話している時やすでに動作中はスキップ

    const gestures = ['headTilt', 'armRaise', 'bodyLean', 'nod', 'lookAround', 'stretch', 'wave'];
    currentGesture = gestures[Math.floor(Math.random() * gestures.length)];
    gestureProgress = 0;

    // 方向を決定（左右ランダム）
    gestureDirection = Math.random() > 0.5 ? 1 : -1;

    const humanoid = currentVrm.humanoid;

    // ジェスチャーごとにターゲットを設定
    if (currentGesture === 'armRaise') {
        gestureTarget = Math.random() > 0.5 ?
            humanoid.getNormalizedBoneNode('rightUpperArm') :
            humanoid.getNormalizedBoneNode('leftUpperArm');
    } else if (currentGesture === 'wave') {
        // 手を振る：右手を使用
        gestureTarget = humanoid.getNormalizedBoneNode('rightUpperArm');
    }
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
                if (gestureProgress < 0.75) {
                    head.rotation.z = gestureDirection * 0.2 * Math.sin(gestureProgress * Math.PI / 0.75);
                } else if (gestureProgress < 1.5) {
                    head.rotation.z = gestureDirection * 0.2 * Math.sin((1.5 - gestureProgress) * Math.PI / 0.75);
                } else {
                    head.rotation.z = 0;
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        } else if (currentGesture === 'armRaise') {
            // 片腕を少し上げる（2秒）
            if (gestureTarget) {
                if (gestureProgress < 1.0) {
                    gestureTarget.rotation.x = -0.3 * Math.sin(gestureProgress * Math.PI);
                } else if (gestureProgress < 2.0) {
                    gestureTarget.rotation.x = -0.3 * Math.sin((2.0 - gestureProgress) * Math.PI);
                } else {
                    gestureTarget.rotation.x = 0;
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        } else if (currentGesture === 'bodyLean') {
            // 体を軽く傾ける（2秒）
            if (currentVrm.scene && gestureProgress < 2.0) {
                const leanAmount = 0.02 * Math.sin(gestureProgress * Math.PI / 2.0);
                currentVrm.scene.rotation.z = gestureDirection * leanAmount;
            } else {
                if (currentVrm.scene) {
                    currentVrm.scene.rotation.z = 0;
                }
                currentGesture = null;
                gestureTarget = null;
            }
        } else if (currentGesture === 'nod') {
            // 頷く（1.5秒）
            const head = humanoid.getNormalizedBoneNode('head');
            if (head) {
                if (gestureProgress < 1.5) {
                    // 2回頷く
                    head.rotation.x = -0.2 * Math.sin(gestureProgress * Math.PI * 2 / 1.5);
                } else {
                    head.rotation.x = 0;
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        } else if (currentGesture === 'lookAround') {
            // 周りを見回す（3秒）
            const head = humanoid.getNormalizedBoneNode('head');
            if (head) {
                if (gestureProgress < 3.0) {
                    // 左→中央→右→中央
                    const cycle = gestureProgress / 3.0;
                    if (cycle < 0.25) {
                        head.rotation.y = -0.4 * (cycle / 0.25);
                    } else if (cycle < 0.5) {
                        head.rotation.y = -0.4 * (1 - (cycle - 0.25) / 0.25);
                    } else if (cycle < 0.75) {
                        head.rotation.y = 0.4 * ((cycle - 0.5) / 0.25);
                    } else {
                        head.rotation.y = 0.4 * (1 - (cycle - 0.75) / 0.25);
                    }
                } else {
                    head.rotation.y = 0;
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        } else if (currentGesture === 'stretch') {
            // 伸びをする（2.5秒）
            const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
            const spine = humanoid.getNormalizedBoneNode('spine');

            if (leftUpperArm && rightUpperArm) {
                if (gestureProgress < 1.0) {
                    // 両腕を上げる
                    const progress = gestureProgress / 1.0;
                    leftUpperArm.rotation.x = -Math.PI * 0.4 * progress;
                    rightUpperArm.rotation.x = -Math.PI * 0.4 * progress;
                    if (spine) {
                        spine.rotation.x = -0.1 * progress;
                    }
                } else if (gestureProgress < 2.0) {
                    // 伸ばしたまま
                    leftUpperArm.rotation.x = -Math.PI * 0.4;
                    rightUpperArm.rotation.x = -Math.PI * 0.4;
                    if (spine) {
                        spine.rotation.x = -0.1;
                    }
                } else if (gestureProgress < 2.5) {
                    // 戻す
                    const progress = (2.5 - gestureProgress) / 0.5;
                    leftUpperArm.rotation.x = -Math.PI * 0.4 * progress;
                    rightUpperArm.rotation.x = -Math.PI * 0.4 * progress;
                    if (spine) {
                        spine.rotation.x = -0.1 * progress;
                    }
                } else {
                    leftUpperArm.rotation.x = 0;
                    rightUpperArm.rotation.x = 0;
                    if (spine) {
                        spine.rotation.x = 0;
                    }
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        } else if (currentGesture === 'wave') {
            // 手を振る（2秒）
            const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
            const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');
            const rightHand = humanoid.getNormalizedBoneNode('rightHand');

            if (rightUpperArm && rightLowerArm) {
                if (gestureProgress < 0.5) {
                    // 腕を上げる
                    const progress = gestureProgress / 0.5;
                    rightUpperArm.rotation.z = Math.PI * 0.3 * progress;
                    rightUpperArm.rotation.x = -Math.PI * 0.2 * progress;
                    rightLowerArm.rotation.y = -Math.PI * 0.3 * progress;
                } else if (gestureProgress < 1.5) {
                    // 手を振る（3回）
                    rightUpperArm.rotation.z = Math.PI * 0.3;
                    rightUpperArm.rotation.x = -Math.PI * 0.2;
                    rightLowerArm.rotation.y = -Math.PI * 0.3;
                    if (rightHand) {
                        rightHand.rotation.z = 0.3 * Math.sin((gestureProgress - 0.5) * Math.PI * 6);
                    }
                } else if (gestureProgress < 2.0) {
                    // 腕を下ろす
                    const progress = (2.0 - gestureProgress) / 0.5;
                    rightUpperArm.rotation.z = Math.PI * 0.3 * progress;
                    rightUpperArm.rotation.x = -Math.PI * 0.2 * progress;
                    rightLowerArm.rotation.y = -Math.PI * 0.3 * progress;
                    if (rightHand) {
                        rightHand.rotation.z = 0;
                    }
                } else {
                    rightUpperArm.rotation.z = 0;
                    rightUpperArm.rotation.x = 0;
                    rightLowerArm.rotation.y = 0;
                    if (rightHand) {
                        rightHand.rotation.z = 0;
                    }
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        } else if (currentGesture === 'jump') {
            // 飛び跳ねる（1.5秒）- イージング適用
            if (currentVrm.scene) {
                if (gestureProgress < 1.5) {
                    const cycle = (gestureProgress / 1.5) * Math.PI;
                    const jumpHeight = Math.sin(cycle) * 0.15; // イージングを適用した高さ
                    currentVrm.scene.position.y = jumpHeight;
                } else {
                    currentVrm.scene.position.y = 0;
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        } else if (currentGesture === 'shoulderDrop') {
            // 肩を落とす（2秒）- イージング適用
            const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
            const head = humanoid.getNormalizedBoneNode('head');

            if (leftUpperArm && rightUpperArm) {
                if (gestureProgress < 1.0) {
                    const progress = easeOutCubic(gestureProgress / 1.0);
                    leftUpperArm.rotation.x = 0.3 * progress;
                    rightUpperArm.rotation.x = 0.3 * progress;
                    if (head) {
                        head.rotation.x = 0.2 * progress;
                    }
                } else if (gestureProgress < 2.0) {
                    const progress = easeInOutQuad((2.0 - gestureProgress) / 1.0);
                    leftUpperArm.rotation.x = 0.3 * progress;
                    rightUpperArm.rotation.x = 0.3 * progress;
                    if (head) {
                        head.rotation.x = 0.2 * progress;
                    }
                } else {
                    leftUpperArm.rotation.x = 0;
                    rightUpperArm.rotation.x = 0;
                    if (head) {
                        head.rotation.x = 0;
                    }
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        } else if (currentGesture === 'stepBack') {
            // 後ろに反る（1.5秒）- イージング適用
            if (currentVrm.scene) {
                if (gestureProgress < 0.5) {
                    const progress = easeOutCubic(gestureProgress / 0.5);
                    currentVrm.scene.position.z = -0.1 * progress;
                    currentVrm.scene.rotation.x = 0.1 * progress;
                } else if (gestureProgress < 1.5) {
                    const progress = easeInOutQuad((1.5 - gestureProgress) / 1.0);
                    currentVrm.scene.position.z = -0.1 * progress;
                    currentVrm.scene.rotation.x = 0.1 * progress;
                } else {
                    currentVrm.scene.position.z = 0;
                    currentVrm.scene.rotation.x = 0;
                    currentGesture = null;
                    gestureTarget = null;
                }
            }
        }
    } catch (error) {
        console.log('ランダムジェスチャーエラー:', error);
        currentGesture = null;
        gestureTarget = null;
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
        // アニメーションミキサーを更新
        if (mixer && useExternalAnimation) {
            mixer.update(deltaTime);

        }

        currentVrm.update(deltaTime);
        updateBlink(deltaTime);
        updateLipSync(deltaTime);
        updateEyeTracking(deltaTime); // 視線追従
        updateIdleExpression(deltaTime); // 待機時の表情変化

        // 外部アニメーションがない場合のみ手動アニメーションを使用
        if (!useExternalAnimation) {
            updateBreathing(deltaTime);
        }

        // 首を傾げているときはアイドルアニメーションの頭の動きをスキップ
        if (isTiltingHead) {
            updateHeadTilt(deltaTime);
        } else if (currentGesture) {
            updateRandomGesture(deltaTime);
        } else if (!useExternalAnimation) {
            // 外部アニメーションがない場合のみ手動アイドルを使用
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

    showSpeechBubble('考え中...');

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
        currentEmotion = emotion; // 現在の感情を保存

        // 感情に応じた動作を実行
        playEmotionalGesture(emotion);

        // 吹き出しで表示
        showSpeechBubble(data.reply);
        startSpeaking();
        const speakDuration = Math.min(data.reply.length * 100, 3000);
        setTimeout(() => {
            stopSpeaking();
        }, speakDuration);

        // 3秒後にニュートラルに戻す
        setTimeout(() => {
            setExpression('neutral');
        }, 3000);

    } catch (error) {
        console.error('エラー:', error);
        showSpeechBubble('申し訳ない。何かエラーが起きた。');
    }
}

// 時間帯に応じた背景を設定
function updateBackground() {
    const hour = new Date().getHours();
    let bgImage;

    if (hour >= 6 && hour < 15) {
        bgImage = './backgrounds/day.jpg';
    } else if (hour >= 15 && hour < 18) {
        bgImage = './backgrounds/evening.jpg';
    } else if (hour >= 18 && hour < 23) {
        bgImage = './backgrounds/night-on.jpg';
    } else {
        bgImage = './backgrounds/night-off.jpg';
    }

    const bgLayer = document.getElementById('bg-layer');
    if (bgLayer) {
        bgLayer.style.backgroundImage = `url('${bgImage}')`;
    }
}

// ページ読み込み時にアバター初期化とイベントリスナー設定
window.addEventListener('DOMContentLoaded', () => {
    initAvatar();
    updateBackground();

    // イベントリスナーを設定
    const sendButton = document.getElementById('sendButton');
    const userInput = document.getElementById('userInput');

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

    // マウスムーブイベント（視線追従）
    window.addEventListener('mousemove', (event) => {
        // マウス座標を-1から1の範囲に正規化
        mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        mouseY = (event.clientY / window.innerHeight) * 2 - 1;
    });
});
