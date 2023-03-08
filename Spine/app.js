import * as THREE from 'three'
import {TrackballControls as THREE_TrackballControls} from 'three/examples/jsm/controls/TrackballControls'
import {OrbitControls as THREE_OrbitControls} from 'three/examples/jsm/controls/OrbitControls'
import {OBJLoader as THREE_OBJLoader} from 'three/examples/jsm/loaders/OBJLoader'
import * as dat from 'dat.gui'
import * as CANNON from 'cannon'
/*
TODO: avoid potential namespace clash 
    eg. THREE.TrackballControls instead of TrackballControls
*/

let renderer, scene, camera, controls, gui, loader_obj, loader_texture, raycaster
let light
let mesh
let world, body, laststep
let spine 
let pointer = new THREE.Vector2()
let hovering
const vec3UP = new CANNON.Vec3(0, 1, 0)
const vec3RIGHT = new CANNON.Vec3(1, 0, 0)
const vec3FWD = new CANNON.Vec3(0, 0, 1)

const controller = 
{
    step: false,
    raycast: true,
    pointerdown: false,
    mouseforce: 30,
}

function onPointerMove(ev)
{
    // calculate pointer position in normalized device coordinates
	// (-1 to +1) for both components

	pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
	pointer.y = - (ev.clientY / window.innerHeight) * 2 + 1;
}

function onPointerUp()
{
    controller.pointerdown = false
}

function onPointerDown()
{
    controller.pointerdown = true
}

window.onload = async function()
{
    /* create our renderer */
    renderer = new THREE.WebGLRenderer()
    renderer.shadowMap.enabled = true
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    /* loader */
    loader_obj = new THREE_OBJLoader()
    loader_texture = new THREE.TextureLoader()

    /* raycaster and pointer move listener */
    raycaster = new THREE.Raycaster()
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointerup", onPointerUp)

    /* scene and control setup */
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000)
    camera.position.set(-6, 6, -6)
    camera.lookAt(0, 0, 0)

    /* dat.gui */
    gui = new dat.GUI()

    /* trackball or orbit*/
    //controls = new THREE_TrackballControls(camera, renderer.domElement)
    controls = new THREE_OrbitControls(camera, renderer.domElement)

    /* lighting */
    scene.add(new THREE.AmbientLight(0x404040))
    light = new THREE.DirectionalLight(0xfffffff, 1.0)
    light.position.set(10, 10, -10)
    light.castShadow = true
    scene.add(light)
    scene.add(new THREE.DirectionalLightHelper(light, 1))
    
    /* physics */
    world = new CANNON.World()
    world.gravity.set(0, -9.8, 0)

    /* load spine and texture */
    loader_obj.load('spine.obj', function(obj)
    {
        let mat = new THREE.MeshStandardMaterial(
            {
                map: loader_texture.load("spine_color.jpg"),
                normalMap: loader_texture.load("spine_normal.jpg")
            }
        )
            
        for(let i = 0; i < obj.children.length; i++)
        {
            obj.children[i].geometry.computeBoundingSphere()
        }
        obj.children.sort((a, b)=>
        {
            if (a.geometry.boundingSphere.center.y < b.geometry.boundingSphere.center.y){
                return 1
            }
            if(a.geometry.boundingSphere.center.y > b.geometry.boundingSphere.center.y)
            {
                return -1
            }
            return 0
        })

        for(let i = 0; i < obj.children.length; i++)
        {
            obj.children[i].material = mat
            const sph = obj.children[i].geometry.boundingSphere
            const raddiv = 2
            
            let viz = new THREE.Mesh(
                new THREE.SphereGeometry(sph.radius / raddiv),
                new THREE.MeshStandardMaterial())
            viz.position.set(sph.center.x, sph.center.y, sph.center.z)
            obj.children[i].viz = viz

            obj.children[i].body = new CANNON.Body({
                mass: i == 0 ? 0 : 0.3,
                position: new CANNON.Vec3(sph.center.x, sph.center.y, sph.center.z),
                shape: new CANNON.Sphere(sph.radius / raddiv),
                // linearDamping: 0.01,
                // angularDamping: 0.01
            })
            world.addBody(obj.children[i].body)
            if(i > 0)
            {
                const sph_mm = obj.children[i - 1].geometry.boundingSphere
                let c1 = new CANNON.PointToPointConstraint(
                    obj.children[i - 1].body, new CANNON.Vec3(0, 0, 0),
                    obj.children[i].body, new CANNON.Vec3(0, 0, 0))
                world.addConstraint(c1)
            }
            
            //scene.add(viz)
        }
        spine = obj
        scene.add(obj)
    })    

    let rendernav = gui.addFolder("Rendering")
    rendernav.add(renderer.shadowMap, "enabled")
    rendernav.open()

    //test mesh
    // mesh = new THREE.Mesh(
    //     new THREE.SphereGeometry(1.0),
    //     new THREE.MeshStandardMaterial())
    // scene.add(mesh)    
    // var movenav = gui.addFolder("Movement")
    // movenav.add(mesh.position, "x", -10, 10, 0.001)
    // movenav.add(mesh.position, "y", -10, 10, 0.001)
    // movenav.add(mesh.position, "z", -10, 10, 0.001)
    // movenav.open()

    let physicsnav = gui.addFolder("Physics")
    physicsnav.add(controller, "step")
    physicsnav.add(controller, "raycast")
    physicsnav.open()

    let forcenav = physicsnav.addFolder("Force")
    forcenav.add(controller, "mouseforce", 0, 100, 0.01)
    hovering = forcenav.add({ text: 'none' }, 'text').name('Hovering')
    console.log(hovering)
    forcenav.open()

    gui.open()
    
    /* begin render loop */
    render()

}


function render(time)
{
    if(laststep !== undefined && controller.step)
    {
        let dt = (time - laststep) / 1000
        world.step(1.0/60.0, dt, 1)

        for(let i = 0; i < spine.children.length; i++)
        {
            spine.children[i].position.copy(spine.children[i].body.position)
            //spine.children[i].quaternion.copy(spine.children[i].body.quaternion)
        }
    }

    if(controller.raycast && controller.step)
    {
        raycaster.setFromCamera(pointer, camera)
        const intersects= raycaster.intersectObjects(scene.children)
        
        if(intersects.length > 0)
        {
            hovering.setValue(intersects[0].object.name)
            
            if(controller.pointerdown && intersects[0].object instanceof THREE.Mesh)
            {
                intersects[0].object.body.applyForce(new CANNON.Vec3(controller.mouseforce, 0, 0), new CANNON.Vec3(0, 0, 0))
            }
        }else
        {
            hovering.setValue("none")
        }
    }

    controls.update()
    renderer.render(scene, camera)
    laststep = time
    requestAnimationFrame(render)
}
