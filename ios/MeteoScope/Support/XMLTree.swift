import Foundation
import FoundationXML

final class XMLTreeNode {
    let name: String
    let attributes: [String: String]
    var text = ""
    var children: [XMLTreeNode] = []

    init(name: String, attributes: [String: String]) {
        self.name = name
        self.attributes = attributes
    }

    func firstChild(named name: String) -> XMLTreeNode? {
        children.first { $0.name == name }
    }

    func firstDescendant(named name: String) -> XMLTreeNode? {
        if self.name == name { return self }
        for child in children {
            if let match = child.firstDescendant(named: name) { return match }
        }
        return nil
    }

    func descendants(named name: String) -> [XMLTreeNode] {
        children.flatMap { child in
            (child.name == name ? [child] : []) + child.descendants(named: name)
        }
    }
}

enum XMLTreeDecoder {
    static func decode(data: Data) throws -> XMLTreeNode {
        let delegate = XMLTreeParserDelegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        guard parser.parse(), let root = delegate.root else {
            throw parser.parserError ?? WeatherAPIError.invalidResponse
        }
        return root
    }
}

private final class XMLTreeParserDelegate: NSObject, XMLParserDelegate {
    var root: XMLTreeNode?
    private var stack: [XMLTreeNode] = []

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes attributeDict: [String: String] = [:]
    ) {
        let name = elementName.split(separator: ":").last.map(String.init) ?? elementName
        let node = XMLTreeNode(name: name, attributes: attributeDict)
        if let parent = stack.last {
            parent.children.append(node)
        } else {
            root = node
        }
        stack.append(node)
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        stack.last?.text += string
    }

    func parser(
        _ parser: XMLParser,
        didEndElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?
    ) {
        guard let node = stack.popLast() else { return }
        node.text = node.text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
