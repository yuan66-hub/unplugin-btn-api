import type { UnpluginFactory } from 'unplugin'
import { createUnplugin } from 'unplugin'
import { Node, walk } from 'estree-walker';
import compiler from '@vue/compiler-sfc'
import fs from 'fs'
import { ModuleInfo } from 'rollup';
export interface Options {
    // define your plugin options here
    routesPath: RegExp,
    importApiPath: RegExp
    compPath: RegExp
    compName: string
    compProp: string
}

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options, meta) => {

    const reg = options?.compPath || /\/Auth\.vue$/
    const routerReg = options?.routesPath || /\/router\/index\.js$/
    const importApiReg = options?.importApiPath || /\/apis\//

    const compName: string = 'auth'
    const compProp: string = 'actions'

    const idsMapBtn: any = {}

    return {
        name: 'unplugin-btn-api',
        vite: {
            async buildEnd() {
                let btns: string[] = []; // 临时变量 
                let page = ''  // 临时变量
                const events: any = {}
                const pageMapUrls: any = {}
                const pageMapFuncs: any = {}
                this.info('\n开始收集....')
                // 查找入口文件
                const fintRootPage = (fileId: string) => {
                    const { importers } = this.getModuleInfo(fileId) as ModuleInfo
                    for (let index = 0; index < importers.length; index++) {
                        const element = importers[index];
                        if (routerReg.test(element)) {
                            page = fileId
                        } else {
                            fintRootPage(element)
                        }
                    }
                }
                // Auth子孙节点查找点击事件、router-link组件、auth嵌套组件
                const findEvents = (chlidren: any, arr: string[]) => {
                    for (let index = 0; index < chlidren.length; index++) {
                        const item = chlidren[index];
                        // 收集嵌套组件
                        if (item.tag.toLowerCase() === compName) {
                            dealAuthCompContent(item)
                            continue;
                        }
                        // 收集router-link组件
                        if (['routerLink', 'router-link'].includes(item.tag.replace(item.tag[0], item.tag.toLowerCase()))) {
                            if (item.props) {
                                const links = item.props.filter((item: any) => item.name === 'bind' && item.rawName === ':to').map((comp: any) => {
                                    const ast = comp.exp.ast
                                    let val
                                    walk(ast, {
                                        enter(node) {
                                            if (node.type === 'ObjectExpression') {
                                                const properties = node.properties
                                                val = properties.map((prop: any) => `"${prop.key.name}":"${prop.value.value}"`).join(',')
                                            }

                                        }
                                    })
                                    return `routerLink-{${val}}`
                                })
                                arr.push(...links)
                            }
                        }
                        // 收集事件名
                        if (item.props) {
                            const eventNames = item.props.filter((item: any) => item.name === 'on').map((item: any) => item.exp.content)
                            arr.push(...eventNames)
                        }
                        // 递归查找子孙节点
                        if (item?.children?.length) {
                            findEvents(item.children, arr)
                        }
                    }

                    return arr
                }
                // 处理Auth组件内容
                const dealAuthCompContent = (ele: any) => {
                    const props = ele.props
                    const chlidren = ele.children
                    const prop = props.find((item: any) => {
                        return item.name === compProp
                    })
                    const content = prop.value.content //按钮权限值
                    btns.push(content)

                    // 查找事件
                    const arr = findEvents(chlidren, []);
                    let tempArr = [...arr]
                    const rouerLinklen = arr.filter(item => item.includes('routerLink')).length
                    if (rouerLinklen && rouerLinklen !== arr.length) {
                        this.warn(`绑定事件和跳转路由(routerLink)不能共用${content}`)
                        tempArr = arr.filter(item => !item.includes('routerLink'))
                    }
                    if (!events[content]) {
                        events[content] = tempArr
                    } else {
                        events[content].push(...tempArr)
                    }
                }
                // 收集按钮控制值
                const collectBtnVal = (childern: any) => {
                    for (let index = 0; index < childern.length; index++) {
                        const ele = childern[index];
                        const { tag } = ele
                        if (tag.toLowerCase() === compName) {
                            dealAuthCompContent(ele)
                        } else {
                            if (ele?.childern?.length)
                                collectBtnVal(ele.childern)
                        }
                    }
                }
                // 收集页面导出api 模块名对应的url路径
                const importNameMapUrl = (ast: any, importedIds: any[]) => {
                    const importedNames: any = {}
                    walk(ast, {
                        enter(node: Node) {
                            // 查找当前页面的api接口
                            if (node.type === 'ImportDeclaration' && importApiReg.test(node?.source?.value as string)) {
                                for (let index = 0; index < node.specifiers.length; index++) {
                                    const element: any = node.specifiers[index];
                                    importedNames[element?.imported?.name] = ''
                                }
                            }
                        },
                    })
                    const names = Object.keys(importedNames)
                    if (names.length) {
                        importedIds.forEach(apiId => {
                            if (importApiReg.test(apiId)) {
                                const apiAst: any = this.getModuleInfo(apiId)?.ast as ModuleInfo['ast']
                                walk(apiAst, {
                                    enter(node: any) {
                                        if (node.type === 'ExportNamedDeclaration') {
                                            const name = node.declaration.id.name
                                            if (names.includes(name)) {
                                                node.declaration.body.body.forEach((item: any) => {
                                                    if (item.type === 'ReturnStatement') {
                                                        item.argument.arguments.forEach((argument: any) => {
                                                            argument.properties.forEach((propertie: any) => {
                                                                if (propertie.key.name === 'url') {
                                                                    importedNames[name] = propertie.value.value
                                                                }
                                                            })
                                                        })
                                                    }
                                                })
                                            }
                                        }
                                    }
                                })
                            }
                        })
                    }
                    return importedNames
                }
                // 获取函数体里面的调用函数名
                const getFunbodyCalleeName = (ast: any) => {
                    const eventsMapApi: any = {}
                    function onDealAst(id: string, bodys: any[]) {
                        bodys.forEach(body => {
                            if (body.type === 'ExpressionStatement' && body.expression.type === 'CallExpression') {
                                if (body.expression.callee.type === 'Identifier') {
                                    const name = body.expression.callee.name
                                    if (!eventsMapApi[id]) {
                                        eventsMapApi[id] = [name]
                                    } else {
                                        eventsMapApi[id].push(name)
                                    }
                                } else if (body.expression.callee.type === 'MemberExpression') {
                                    const name = body.expression.callee.object.name
                                    const property = body.expression.callee.property.name
                                    if (name === 'router' && property === 'push') {
                                        const prop = body.expression.arguments[0]
                                        const properties = prop.properties
                                        const val = properties.map((item: any) => `"${item.key.name}":"${item.value.value}"`).join(',')
                                        if (!eventsMapApi[id]) {
                                            eventsMapApi[id] = [`routerLink-{${val}}`]
                                        } else {
                                            eventsMapApi[id].push(`routerLink-{${val}}`)
                                        }
                                    }
                                }
                            }
                        })
                    }
                    walk(ast, {
                        enter(node) {
                            if (node.type === 'VariableDeclaration') {
                                const declarations = node.declarations.filter((item: any) => ['ArrowFunctionExpression', 'FunctionExpression'].includes(item?.init?.type))
                                declarations.forEach((item: any) => {
                                    const id = item.id.name
                                    const bodys = item.init.body.body
                                    onDealAst(id, bodys)
                                })
                            } else if (node.type === 'FunctionDeclaration') {
                                const id = node.id.name
                                const bodys = node.body.body
                                onDealAst(id, bodys)
                            }
                        }
                    })

                    return eventsMapApi


                }
                const genateIdsMapBtns = (myBtns: any) => {
                    if (page && !idsMapBtn[page]) {
                        // 初始化page
                        idsMapBtn[page] = {}
                    }
                    for (let index = 0; index < myBtns.length; index++) {
                        const btn = myBtns[index];
                        if (idsMapBtn[page][btn]) {
                            this.warn(`${page} 该页面下出现重复按钮值${btn}`)
                        } else {
                            idsMapBtn[page][btn] = []
                        }
                    }
                }
                for (const moduleId of this.getModuleIds()) {
                    if (reg.test(moduleId)) {
                        // 引入导入Auth组件模块
                        const { importers } = this.getModuleInfo(moduleId) as ModuleInfo
                        for (let index = 0; index < importers.length; index++) {
                            btns = []
                            const element = importers[index];
                            // 获取源文件代码
                            const source = fs.readFileSync(element, 'utf-8')
                            const { ast, importedIds } = this.getModuleInfo(element) as ModuleInfo
                            // 获取html模板内容
                            const childern: any = compiler.parse(source)?.descriptor?.template?.ast?.children
                            collectBtnVal(childern)
                            fintRootPage(element)
                            genateIdsMapBtns(btns)
                            pageMapFuncs[page] = getFunbodyCalleeName(ast)
                            pageMapUrls[page] = importNameMapUrl(ast, importedIds as any[])
                        }
                    }
                }

                for (const key in idsMapBtn) {
                    const element = idsMapBtn[key];
                    for (const btn in element) {
                        const event = events[btn] || [];
                        event.forEach((item: any) => {
                            if (pageMapFuncs[key][item]) {
                                const apis = pageMapFuncs[key][item]
                                apis.forEach((api: any) => {
                                    element[btn].push(pageMapUrls[key][api] || api)
                                })
                            } else {
                                element[btn].push(item)
                            }

                        })
                        element[btn] = [...new Set(element[btn])]
                    }
                }
                fs.writeFileSync('btn-api.json', JSON.stringify(idsMapBtn), 'utf-8')
                this.info('\n收集完成')
            },
        },
    }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export const viteBtnApiPlugin = unplugin.vite


export default unplugin