//
//  Regular Phsyics Cubes
//

const cube = object.get('Cube')
object.remove(cube)

const box = object.create('box')
// box.setMaterial(1,1,1)
box.position.y += 0.5
box.color = 'black'
box.metalness = 1
box.roughness = 0
box.collision = 'dynamic'
box.collisionLayer = 'prop'
object.add(box)

//
// Ramp
//

const cube = object.get('Cube')
object.remove(cube)

const box = object.create('box')
box.setSize(5, 8, 1)
box.position.y += 1
box.rotation.x = 70 * DEG2RAD // 90-70 = 20deg slope
// box.rotation.x = 45 * DEG2RAD // 90-45 = 45deg slope
// box.rotation.x = 30 * DEG2RAD // 90-30 = 60deg slope
// box.rotation.x = 20 * DEG2RAD // 90-20 = 70deg slope
box.color = 'black'
box.metalness = 1
box.roughness = 0
box.collision = 'kinematic'
box.collisionLayer = 'prop'
object.add(box)

//
// Wall
//

const cube = object.get('Cube')
object.remove(cube)

const box = object.create('box')
box.setSize(5, 8, 1)
box.position.y += 4
box.color = 'black'
box.metalness = 1
box.roughness = 0
box.collision = 'kinematic'
box.collisionLayer = 'prop'
object.add(box)

//
// Kinematic Spinny
//

const cube = object.get('Cube')
object.remove(cube)

const box = object.create('box')
box.setSize(3, 1, 3)
box.position.y += 0.5
box.color = 'green'
box.metalness = 1
box.roughness = 0
box.collision = 'kinematic'
box.setMaterial(1, 1, 0)

box.position.copy(object.position)
box.rotation.copy(object.rotation)
world.add(box)

const yAxis = new Vector3(0, 1, 0)
const q1 = new Quaternion()
const q2 = new Quaternion()
const v1 = new Vector3()

const aVel = new Vector3(0, 1, 0)

object.on('fixedUpdate', delta => {
  v1.copy(box.position)
  q1.copy(box.quaternion)
  q2.setFromAxisAngle(yAxis, 3 * delta)
  q1.multiply(q2)
  box.setKinematicTarget(v1, q1)
})
