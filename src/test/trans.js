import {Transform, Step, Remapping} from "../transform"
import {cmpNode, cmpStr} from "./cmp"
import {Failure} from "./failure"

function tag(tr, name) {
  return tr.map(tr.before.tag[name]).pos
}

function mrk(tr, mark) {
  return mark && (typeof mark == "string" ? tr.doc.type.schema.mark(mark) : mark)
}

class DelayedTransform {
  constructor(steps) {
    this.steps = steps
  }

  plus(f) {
    return new DelayedTransform(this.steps.concat(f))
  }

  addMark(mark, from, to) {
    return this.plus(tr => tr.addMark(tag(tr, from || "a"), tag(tr, to || "b"), mrk(tr, mark)))
  }

  rmMark(mark, from, to) {
    return this.plus(tr => tr.removeMark(tag(tr, from || "a"), tag(tr, to || "b"), mrk(tr, mark)))
  }

  ins(nodes, at) {
    return this.plus(tr => tr.insert(tag(tr, at || "a"), nodes))
  }

  del(from, to) {
    return this.plus(tr => tr.delete(tag(tr, from || "a"), tag(tr, to || "b")))
  }

  txt(text, at) {
    return this.plus(tr => tr.insertText(tag(tr, at || "a"), text))
  }

  join(at) {
    return this.plus(tr => tr.join(tag(tr, at || "a")))
  }

  split(at, depth, type, attrs) {
    return this.plus(tr => tr.split(tag(tr, at || "a"), depth,
                                    type && tr.doc.type.schema.nodeType(type), attrs))
  }

  lift(from, to) {
    return this.plus(tr => tr.lift(tag(tr, from || "a"), tag(tr, to || "b")))
  }

  wrap(type, attrs, from, to) {
    return this.plus(tr => tr.wrap(tag(tr, from || "a"), tag(tr, to || "b"), tr.doc.type.schema.nodeType(type), attrs))
  }

  blockType(type, attrs, from, to) {
    return this.plus(tr => tr.setBlockType(tag(tr, from || "a"), tag(tr, to || "b"),
                                           tr.doc.type.schema.nodeType(type), attrs))
  }

  nodeType(type, attrs, at) {
    return this.plus(tr => tr.setNodeType(tag(tr, at || "a"), tr.doc.type.schema.nodeType(type), attrs))
  }

  repl(slice, from, to) {
    return this.plus(tr => tr.replace(tag(tr, from || "a"), tag(tr, to || "b"), slice))
  }

  get(doc) {
    let tr = new Transform(doc)
    for (let i = 0; i < this.steps.length; i++) this.steps[i](tr)
    return tr
  }
}

export const tr = new DelayedTransform([])

function invert(transform) {
  let out = new Transform(transform.doc)
  for (let i = transform.steps.length - 1; i >= 0; i--)
    out.step(transform.steps[i].invert(transform.docs[i]))
  return out
}

function testMapping(maps, pos, newPos, label) {
  let mapped = pos
  maps.forEach(m => mapped = m.map(mapped, 1).pos)
  cmpStr(mapped, newPos, label)

  let ident = {}
  for (let i = 0; i < maps.length; i++) ident[-i - 1] = i
  let remap = new Remapping(maps.map(x => x.invert()), maps, ident)
  cmpStr(remap.map(newPos, 1).pos, newPos, label + " back")
}

function testStepJSON(tr) {
  let newTR = new Transform(tr.before)
  tr.steps.forEach(step => newTR.step(Step.fromJSON(tr.doc.type.schema, step.toJSON())))
  cmpNode(tr.doc, newTR.doc)
}

export function testTransform(tr, expect) {
  if (tr.failed) {
    if (expect != "fail") throw new Failure("Transform failed unexpectedly: " + tr.failed)
    return
  } else if (expect == "fail") {
    throw new Failure("Transform succeeded unexpectedly")
  }

  cmpNode(tr.doc, expect)
  let inverted = invert(tr)
  if (inverted.failed) throw new Failure("Inverting transform failed: " + inverted.failed)
  cmpNode(inverted.doc, tr.before, "inverted")

  testStepJSON(tr)

  let maps = tr.maps
  for (var tag in expect.tag) // FIXME Babel 6.5.1 screws this up when I use let
    testMapping(maps, tr.before.tag[tag], expect.tag[tag], tag)
}
