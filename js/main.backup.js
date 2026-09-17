/**
 * ============================================================
 * MY FARM 3D — MAIN APPLICATION
 * ============================================================
 *
 * المرحلة الحالية:
 * - Application Bootstrap
 * - DOM
 * - Renderer
 * - Scene
 * - Camera
 * - Ground
 * - Resize
 * - Game Loop
 *
 * ============================================================
 */

import * as THREE from 'three';

import { Events } from './core/EventBus.js';
import { GameState } from './core/GameState.js';
import { SaveManager } from './core/SaveManager.js';
import { Time } from './core/TimeManager.js';


/* ============================================================
   CONFIGURATION
   ============================================================ */

const CONFIG = Object.freeze({

    renderer: {

        antialias: true,

        alpha: false,

        powerPreference: 'high-performance'

    },

    camera: {

        fov: 60,

        near: 0.1,

        far: 500

    },

    performance: {

        maxPixelRatio: 2

    },

    ground: {

        width: 100,

        height: 100,

        color: 0x4f8f3a

    }

});


/* ============================================================
   APPLICATION
   ============================================================ */

class MyFarmApp {

    constructor() {

        /* ----------------------------------------------------
           DOM
        ---------------------------------------------------- */

        this.canvas = null;

        this.container = null;


        /* ----------------------------------------------------
           THREE.JS
        ---------------------------------------------------- */

        this.scene = null;

        this.camera = null;

        this.renderer = null;


        /* ----------------------------------------------------
           WORLD
        ---------------------------------------------------- */

        this.ground = null;


        /* ----------------------------------------------------
           GAME STATE
        ---------------------------------------------------- */

        this.running = false;

        this.initialized = false;


        /* ----------------------------------------------------
           CLOCK
        ---------------------------------------------------- */

        this.clock = new THREE.Clock();


        /* ----------------------------------------------------
           BINDINGS
        ---------------------------------------------------- */

        this._boundResize = () => this.resize();

        this._boundLoop = () => this.gameLoop();
        this.keys = {
    
    up: false,
    down: false,
    left: false,
    right: false
    
};

    }


    /* ========================================================
       DOM
       ======================================================== */

    cacheDOM() {

        this.container =
            document.getElementById(
                'game-container'
            );

        this.canvas =
            document.getElementById(
                'game-canvas'
            );


        if (!this.canvas) {

            throw new Error(
                '[MY FARM] game-canvas not found.'
            );

        }


        console.log(
            '[MY FARM] DOM cached.'
        );

    }


    /* ========================================================
       BOOT
       ======================================================== */

    async boot() {

        try {

            console.log(
                '[MY FARM] Starting...'
            );


            /* ------------------------------------------------
               DOM
            ------------------------------------------------ */

            this.cacheDOM();
            this.setupControls();


            /* ------------------------------------------------
               THREE.JS
            ------------------------------------------------ */

            this.createRenderer();

            this.createScene();

            this.createCamera();


            /* ------------------------------------------------
               WORLD
            ------------------------------------------------ */

            this.createGround();


            /* ------------------------------------------------
               RESIZE
            ------------------------------------------------ */

            this.resize();

            window.addEventListener(
                'resize',
                this._boundResize
            );


            /* ------------------------------------------------
               APPLICATION READY
            ------------------------------------------------ */

            this.initialized = true;


            console.log(
                '[MY FARM] Application initialized.'
            );


            /* ------------------------------------------------
               HIDE LOADING SCREEN
            ------------------------------------------------ */

            this.hideLoading();


            /* ------------------------------------------------
               START GAME LOOP
            ------------------------------------------------ */

            this.start();


            Events.emit(
                'game:ready',
                this
            );


        } catch (error) {

            console.error(
                '[MY FARM] Boot error:',
                error
            );

        }

    }


    /* ========================================================
       RENDERER
       ======================================================== */

    createRenderer() {

        this.renderer =
            new THREE.WebGLRenderer({

                canvas: this.canvas,

                antialias:
                    CONFIG.renderer.antialias,

                alpha:
                    CONFIG.renderer.alpha,

                powerPreference:
                    CONFIG.renderer.powerPreference

            });


        this.renderer.setPixelRatio(

            Math.min(

                window.devicePixelRatio,

                CONFIG.performance.maxPixelRatio

            )

        );


        this.renderer.setSize(

            window.innerWidth,

            window.innerHeight,

            false

        );


        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;


        console.log(
            '[MY FARM] Renderer created.'
        );

    }


    /* ========================================================
       SCENE
       ======================================================== */

    createScene() {

        this.scene =
            new THREE.Scene();


        this.scene.background =
            new THREE.Color(
                0x87ceeb
            );


        console.log(
            '[MY FARM] Scene created.'
        );

    }


    /* ========================================================
       CAMERA
       ======================================================== */

    createCamera() {

        this.camera =
            new THREE.PerspectiveCamera(

                CONFIG.camera.fov,

                window.innerWidth /
                    window.innerHeight,

                CONFIG.camera.near,

                CONFIG.camera.far

            );


        this.camera.position.set(
            0,
            8,
            12
        );


        this.camera.lookAt(
            0,
            0,
            0
        );


        console.log(
            '[MY FARM] Camera created.'
        );

    }


    /* ========================================================
       GROUND
       ======================================================== */

    createGround() {

    /* ========================================================
       GRASS GROUND
       ======================================================== */

    const groundGeometry =
    new THREE.PlaneGeometry(
        CONFIG.ground.width,
        CONFIG.ground.height,
        
        
    );





    const groundMaterial =
        new THREE.MeshStandardMaterial({

            color: 0x4f8f3a,

            roughness: 1,

            metalness: 0

        });


    this.ground =
        new THREE.Mesh(

            groundGeometry,

            groundMaterial

        );


    this.ground.rotation.x =
        -Math.PI / 2;


    this.ground.position.set(
        0,
        0,
        0
    );


    this.ground.receiveShadow =
        true;


    this.scene.add(
        this.ground
    );
/* ========================================================
   FIRST FARM FIELD
   ======================================================== */

const fieldGeometry =
    new THREE.PlaneGeometry(
        10,
        14
    );


const fieldMaterial =
    new THREE.MeshStandardMaterial({

        color: 0x6b4528,

        roughness: 1,

        metalness: 0

    });


const field =
    new THREE.Mesh(

        fieldGeometry,

        fieldMaterial

    );


field.rotation.x =
    -Math.PI / 2;


field.position.set(
    -10,
    0.03,
    0
);


field.receiveShadow =
    true;


this.scene.add(
    field
);

    /* ========================================================
       DIRT PATH
       ======================================================== */

    const pathGeometry =
        new THREE.PlaneGeometry(
            8,
            100
        );


    const pathMaterial =
        new THREE.MeshStandardMaterial({

            color: 0xc89b63,

            roughness: 1,

            metalness: 0

        });


    const path =
        new THREE.Mesh(

            pathGeometry,

            pathMaterial

        );


    path.rotation.x =
        -Math.PI / 2;


    path.position.set(
        0,
        0.8,
        0
    );


    path.receiveShadow =
        true;


    this.scene.add(
        path
    );


    /* ========================================================
       LIGHT
       ======================================================== */

    const ambientLight =
        new THREE.HemisphereLight(

            0xffffff,

            0x557755,

            2

        );


    this.scene.add(
        ambientLight
    );


    const sun =
        new THREE.DirectionalLight(

            0xffffff,

            2

        );


    sun.position.set(
        30,
        50,
        20
    );


    sun.castShadow =
        true;


    this.scene.add(
        sun
    );


    console.log(
        '[MY FARM] Ground created.'
    );

}

    /* ========================================================
       RESIZE
       ======================================================== */

    resize() {

        if (
            !this.camera ||
            !this.renderer
        ) {

            return;

        }


        const width =
            window.innerWidth;


        const height =
            window.innerHeight;


        this.camera.aspect =
            width / height;


        this.camera.updateProjectionMatrix();


        this.renderer.setSize(
            width,
            height,
            false
        );


        this.renderer.setPixelRatio(

            Math.min(

                window.devicePixelRatio,

                CONFIG.performance.maxPixelRatio

            )

        );

    }


    /* ========================================================
       START
       ======================================================== */

setupControls() {
    
    const controls = {
        
        up: 'dpad-up',
        down: 'dpad-down',
        left: 'dpad-left',
        right: 'dpad-right'
        
    };
    
    
    Object.entries(controls).forEach(
        ([direction, id]) => {
            
            const button =
                document.getElementById(id);
            
            
            if (!button) {
                
                console.warn(
                    `[MY FARM] Control not found: ${id}`
                );
                
                return;
                
            }
            
            
            const press = (event) => {
                
                event.preventDefault();
                
                this.keys[direction] = true;
                
            };
            
            
            const release = (event) => {
                
                event.preventDefault();
                
                this.keys[direction] = false;
                
            };
            
            
            button.addEventListener(
                'pointerdown',
                press
            );
            
            
            button.addEventListener(
                'pointerup',
                release
            );
            
            
            button.addEventListener(
                'pointercancel',
                release
            );
            
            
            button.addEventListener(
                'pointerleave',
                release
            );
            
        }
    );
    
    
    console.log(
        '[MY FARM] Controls ready.'
    );
    
}



    start() {

        if (this.running) {

            return;

        }


        this.running = true;

        this.clock.start();


        requestAnimationFrame(
            this._boundLoop
        );


        console.log(
            '[MY FARM] Game loop started.'
        );

    }


    /* ========================================================
       GAME LOOP
       ======================================================== */

    gameLoop() {

        if (!this.running) {

            return;

        }


        const delta =
            this.clock.getDelta();


        this.update(delta);

        this.render();


        requestAnimationFrame(
            this._boundLoop
        );

    }


    /* ========================================================
       UPDATE
       ======================================================== */

    update(delta) {

        /*
         * هنا هنضيف أنظمة اللعبة
         * في المراحل القادمة.
         */

        void delta;

    }


    /* ========================================================
       RENDER
       ======================================================== */

    render() {

        if (
            !this.renderer ||
            !this.scene ||
            !this.camera
        ) {

            return;

        }


        this.renderer.render(
            this.scene,
            this.camera
        );

    }


    /* ========================================================
       LOADING SCREEN
       ======================================================== */

    hideLoading() {

        const loadingScreen =
            document.getElementById(
                'loading-screen'
            );


        if (!loadingScreen) {

            return;

        }


        loadingScreen.style.display =
            'none';

    }


    /* ========================================================
       STOP
       ======================================================== */

    stop() {

        this.running = false;

    }


    /* ========================================================
       DESTROY
       ======================================================== */

    destroy() {

        this.stop();


        window.removeEventListener(
            'resize',
            this._boundResize
        );


        if (this.ground) {

            this.ground.geometry.dispose();

            this.ground.material.dispose();

            this.scene.remove(
                this.ground
            );

            this.ground = null;

        }


        if (this.renderer) {

            this.renderer.dispose();

            this.renderer = null;

        }


        this.scene = null;

        this.camera = null;

        this.initialized = false;


        console.log(
            '[MY FARM] Application destroyed.'
        );

    }

}


/* ============================================================
   APPLICATION INSTANCE
   ============================================================ */

const app =
    new MyFarmApp();


/* ============================================================
   START
   ============================================================ */

if (
    document.readyState === 'loading'
) {

    document.addEventListener(

        'DOMContentLoaded',

        () => app.boot(),

        {
            once: true
        }

    );

} else {

    app.boot();

}


/* ============================================================
   DEVELOPMENT ACCESS
   ============================================================ */

if (
    typeof window !== 'undefined'
) {

    window.MY_FARM = app;

}