import PDFKit
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct DisasterMapView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var documentURL = DisasterMapStorage.storedURL
    @State private var markers = DisasterMapStorage.loadMarkers()
    @State private var isImporterPresented = false
    @State private var isAddingMarker = false
    @State private var presentedSheet: DisasterMapSheet?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            DisasterMapContent(
                documentURL: documentURL,
                markers: markers,
                isAddingMarker: isAddingMarker,
                onAddMarker: addMarker,
                onImport: { isImporterPresented = true }
            )
            .navigationTitle("防災マップ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .safeAreaInset(edge: .bottom) {
                if isAddingMarker {
                    Label("地図上の目印を置く位置をタップ", systemImage: "mappin.and.ellipse")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .meteoGlassSurface(cornerRadius: 18, interactive: true, tint: .red.opacity(0.2))
                        .padding(.bottom, 8)
                }
            }
            .fileImporter(
                isPresented: $isImporterPresented,
                allowedContentTypes: [.pdf, .png, .jpeg],
                allowsMultipleSelection: false,
                onCompletion: importDocument
            )
            .sheet(item: $presentedSheet) { sheet in
                switch sheet {
                case .editor(let marker):
                    DisasterMarkerEditor(marker: marker, onSave: saveMarker)
                case .list:
                    DisasterMarkerList(markers: $markers, onChange: persistMarkers)
                }
            }
            .alert("ファイルを保存できませんでした", isPresented: errorBinding) {
                Button("閉じる", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "不明なエラー")
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button("閉じる") { dismiss() }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if documentURL != nil {
                Button {
                    isAddingMarker.toggle()
                } label: {
                    Image(systemName: isAddingMarker ? "mappin.slash" : "mappin.and.ellipse")
                }
                .tint(isAddingMarker ? .red : nil)
                .accessibilityLabel(isAddingMarker ? "目印追加を終了" : "目印を追加")

                Button {
                    presentedSheet = .list
                } label: {
                    Image(systemName: "list.bullet")
                }
                .accessibilityLabel("目印一覧")

                Menu {
                    Button("地図を差し替える", systemImage: "arrow.triangle.2.circlepath") {
                        isImporterPresented = true
                    }
                    Button("地図を削除", systemImage: "trash", role: .destructive) {
                        removeDocument()
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("防災マップの操作")
            }
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )
    }

    private func addMarker(pageIndex: Int, x: Double, y: Double) {
        let marker = DisasterMapMarker(
            id: UUID(),
            pageIndex: pageIndex,
            x: min(max(x, 0), 1),
            y: min(max(y, 0), 1),
            title: "避難場所",
            note: "",
            symbol: .shelter,
            createdAt: .now
        )
        isAddingMarker = false
        presentedSheet = .editor(marker)
    }

    private func saveMarker(_ marker: DisasterMapMarker) {
        if let index = markers.firstIndex(where: { $0.id == marker.id }) {
            markers[index] = marker
        } else {
            markers.append(marker)
        }
        persistMarkers()
    }

    private func persistMarkers() {
        do {
            try DisasterMapStorage.saveMarkers(markers)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func importDocument(_ result: Result<[URL], Error>) {
        do {
            guard let selectedURL = try result.get().first else { return }
            documentURL = try DisasterMapStorage.importFile(from: selectedURL)
            markers = []
            isAddingMarker = false
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func removeDocument() {
        DisasterMapStorage.removeStoredFile(removeMarkers: true)
        documentURL = nil
        markers = []
        isAddingMarker = false
    }
}

private struct DisasterMapContent: View {
    let documentURL: URL?
    let markers: [DisasterMapMarker]
    let isAddingMarker: Bool
    let onAddMarker: (Int, Double, Double) -> Void
    let onImport: () -> Void

    var body: some View {
        Group {
            if let documentURL {
                if documentURL.pathExtension.lowercased() == "pdf" {
                    EditablePDFDocumentView(
                        url: documentURL,
                        markers: markers,
                        isAddingMarker: isAddingMarker,
                        onAddMarker: onAddMarker
                    )
                    .ignoresSafeArea(edges: .bottom)
                } else if let image = UIImage(contentsOfFile: documentURL.path) {
                    EditableDisasterMapImage(
                        image: image,
                        markers: markers.filter { $0.pageIndex == 0 },
                        isAddingMarker: isAddingMarker,
                        onAddMarker: { x, y in onAddMarker(0, x, y) }
                    )
                } else {
                    ContentUnavailableView("地図を開けません", systemImage: "exclamationmark.triangle")
                }
            } else {
                ContentUnavailableView {
                    Label("防災マップを追加", systemImage: "map")
                } description: {
                    Text("自治体の防災マップをPDF・PNG・JPEGで保存して、オフラインでも確認できます。")
                } actions: {
                    Button("ファイルを選択", action: onImport)
                        .buttonStyle(.borderedProminent)
                }
            }
        }
    }
}

private struct EditableDisasterMapImage: View {
    let image: UIImage
    let markers: [DisasterMapMarker]
    let isAddingMarker: Bool
    let onAddMarker: (Double, Double) -> Void

    var body: some View {
        GeometryReader { proxy in
            let rect = aspectFitRect(imageSize: image.size, containerSize: proxy.size)
            ZStack(alignment: .topLeading) {
                Color(uiColor: .systemGroupedBackground)
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: rect.width, height: rect.height)
                    .position(x: rect.midX, y: rect.midY)

                ForEach(markers) { marker in
                    DisasterMarkerBadge(marker: marker)
                        .position(
                            x: rect.minX + CGFloat(marker.x) * rect.width,
                            y: rect.minY + CGFloat(marker.y) * rect.height
                        )
                }
            }
            .contentShape(Rectangle())
            .gesture(
                SpatialTapGesture().onEnded { value in
                    guard isAddingMarker, rect.contains(value.location), rect.width > 0, rect.height > 0 else {
                        return
                    }
                    onAddMarker(
                        Double((value.location.x - rect.minX) / rect.width),
                        Double((value.location.y - rect.minY) / rect.height)
                    )
                }
            )
        }
    }

    private func aspectFitRect(imageSize: CGSize, containerSize: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else {
            return CGRect(origin: .zero, size: containerSize)
        }
        let scale = min(containerSize.width / imageSize.width, containerSize.height / imageSize.height)
        let size = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        return CGRect(
            x: (containerSize.width - size.width) / 2,
            y: (containerSize.height - size.height) / 2,
            width: size.width,
            height: size.height
        )
    }
}

private struct DisasterMarkerBadge: View {
    let marker: DisasterMapMarker

    var body: some View {
        Image(systemName: marker.symbol.systemImage)
            .font(.caption.weight(.black))
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(marker.symbol.color, in: Circle())
            .overlay(Circle().stroke(.white, lineWidth: 2))
            .shadow(color: .black.opacity(0.3), radius: 3, y: 2)
            .accessibilityLabel(marker.title)
    }
}

private struct EditablePDFDocumentView: UIViewRepresentable {
    let url: URL
    let markers: [DisasterMapMarker]
    let isAddingMarker: Bool
    let onAddMarker: (Int, Double, Double) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.document = PDFDocument(url: url)
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = .systemGroupedBackground
        let recognizer = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        recognizer.cancelsTouchesInView = false
        view.addGestureRecognizer(recognizer)
        context.coordinator.render(markers: markers, in: view)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        context.coordinator.parent = self
        if view.document?.documentURL != url {
            view.document = PDFDocument(url: url)
        }
        context.coordinator.render(markers: markers, in: view)
    }

    final class Coordinator: NSObject {
        var parent: EditablePDFDocumentView
        private var renderedSignature = ""
        private var annotations: [PDFAnnotation] = []

        init(parent: EditablePDFDocumentView) {
            self.parent = parent
        }

        @objc func handleTap(_ recognizer: UITapGestureRecognizer) {
            guard parent.isAddingMarker,
                  let view = recognizer.view as? PDFView,
                  let document = view.document
            else {
                return
            }
            let location = recognizer.location(in: view)
            guard let page = view.page(for: location, nearest: true) else { return }
            let point = view.convert(location, to: page)
            let bounds = page.bounds(for: view.displayBox)
            guard bounds.width > 0, bounds.height > 0 else { return }
            parent.onAddMarker(
                document.index(for: page),
                Double((point.x - bounds.minX) / bounds.width),
                Double((point.y - bounds.minY) / bounds.height)
            )
        }

        func render(markers: [DisasterMapMarker], in view: PDFView) {
            let signature = markers.map { "\($0.id)-\($0.pageIndex)-\($0.x)-\($0.y)-\($0.symbol.rawValue)" }.joined()
            guard renderedSignature != signature else { return }
            for annotation in annotations { annotation.page?.removeAnnotation(annotation) }
            annotations = []

            guard let document = view.document else { return }
            for marker in markers {
                guard let page = document.page(at: marker.pageIndex) else { continue }
                let pageBounds = page.bounds(for: view.displayBox)
                let size: CGFloat = max(18, min(pageBounds.width, pageBounds.height) * 0.035)
                let center = CGPoint(
                    x: pageBounds.minX + CGFloat(marker.x) * pageBounds.width,
                    y: pageBounds.minY + CGFloat(marker.y) * pageBounds.height
                )
                let bounds = CGRect(x: center.x - size / 2, y: center.y - size / 2, width: size, height: size)
                let annotation = PDFAnnotation(bounds: bounds, forType: .circle, withProperties: nil)
                annotation.color = .white
                annotation.interiorColor = marker.symbol.uiColor
                annotation.contents = marker.title
                let border = PDFBorder()
                border.lineWidth = 2
                annotation.border = border
                page.addAnnotation(annotation)
                annotations.append(annotation)
            }
            renderedSignature = signature
        }
    }
}

private struct DisasterMarkerEditor: View {
    @Environment(\.dismiss) private var dismiss
    let marker: DisasterMapMarker
    let onSave: (DisasterMapMarker) -> Void
    @State private var title: String
    @State private var note: String
    @State private var symbol: DisasterMarkerSymbol

    init(marker: DisasterMapMarker, onSave: @escaping (DisasterMapMarker) -> Void) {
        self.marker = marker
        self.onSave = onSave
        _title = State(initialValue: marker.title)
        _note = State(initialValue: marker.note)
        _symbol = State(initialValue: marker.symbol)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("目印") {
                    TextField("名称", text: $title)
                    Picker("種類", selection: $symbol) {
                        ForEach(DisasterMarkerSymbol.allCases) { item in
                            Label(item.label, systemImage: item.systemImage).tag(item)
                        }
                    }
                }
                Section("メモ") {
                    TextField("集合場所や注意事項", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle("目印を編集")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存", action: save).disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        onSave(
            DisasterMapMarker(
                id: marker.id,
                pageIndex: marker.pageIndex,
                x: marker.x,
                y: marker.y,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                symbol: symbol,
                createdAt: marker.createdAt
            )
        )
        dismiss()
    }
}

private struct DisasterMarkerList: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var markers: [DisasterMapMarker]
    let onChange: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if markers.isEmpty {
                    ContentUnavailableView("目印はありません", systemImage: "mappin.slash")
                } else {
                    ForEach($markers) { $marker in
                        NavigationLink {
                            DisasterMarkerEditor(marker: marker) { updated in
                                marker = updated
                                onChange()
                            }
                        } label: {
                            Label {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(marker.title)
                                    if !marker.note.isEmpty {
                                        Text(marker.note).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                    }
                                }
                            } icon: {
                                Image(systemName: marker.symbol.systemImage).foregroundStyle(marker.symbol.color)
                            }
                        }
                    }
                    .onDelete { offsets in
                        markers.remove(atOffsets: offsets)
                        onChange()
                    }
                }
            }
            .navigationTitle("目印一覧")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("完了") { dismiss() } }
            }
        }
    }
}

private enum DisasterMapSheet: Identifiable {
    case editor(DisasterMapMarker)
    case list

    var id: String {
        switch self {
        case .editor(let marker): "editor-\(marker.id)"
        case .list: "list"
        }
    }
}

private struct DisasterMapMarker: Identifiable, Codable, Hashable {
    let id: UUID
    let pageIndex: Int
    let x: Double
    let y: Double
    var title: String
    var note: String
    var symbol: DisasterMarkerSymbol
    let createdAt: Date
}

private enum DisasterMarkerSymbol: String, CaseIterable, Identifiable, Codable {
    case shelter
    case meeting
    case danger
    case supplies

    var id: String { rawValue }
    var label: String {
        switch self {
        case .shelter: "避難場所"
        case .meeting: "集合場所"
        case .danger: "危険箇所"
        case .supplies: "備蓄・給水"
        }
    }
    var systemImage: String {
        switch self {
        case .shelter: "house.fill"
        case .meeting: "person.3.fill"
        case .danger: "exclamationmark.triangle.fill"
        case .supplies: "cross.case.fill"
        }
    }
    var color: Color {
        switch self {
        case .shelter: .blue
        case .meeting: .green
        case .danger: .red
        case .supplies: .orange
        }
    }
    var uiColor: UIColor {
        switch self {
        case .shelter: .systemBlue
        case .meeting: .systemGreen
        case .danger: .systemRed
        case .supplies: .systemOrange
        }
    }
}

private enum DisasterMapStorage {
    private static let fileNameKey = "disasterMapStoredFileName"
    private static let markersFileName = "disaster-map-markers.json"

    static var storedURL: URL? {
        guard let name = UserDefaults.standard.string(forKey: fileNameKey), !name.isEmpty else { return nil }
        let url = storageDirectory.appending(path: name)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    static func importFile(from sourceURL: URL) throws -> URL {
        let hasAccess = sourceURL.startAccessingSecurityScopedResource()
        defer { if hasAccess { sourceURL.stopAccessingSecurityScopedResource() } }

        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        removeStoredFile(removeMarkers: true)
        let fileExtension = sourceURL.pathExtension.lowercased()
        let destination = storageDirectory.appending(path: "disaster-map.\(fileExtension)")
        try FileManager.default.copyItem(at: sourceURL, to: destination)
        UserDefaults.standard.set(destination.lastPathComponent, forKey: fileNameKey)
        return destination
    }

    static func removeStoredFile(removeMarkers: Bool) {
        if let current = storedURL { try? FileManager.default.removeItem(at: current) }
        UserDefaults.standard.removeObject(forKey: fileNameKey)
        if removeMarkers { try? FileManager.default.removeItem(at: markersURL) }
    }

    static func loadMarkers() -> [DisasterMapMarker] {
        guard let data = try? Data(contentsOf: markersURL) else { return [] }
        return (try? JSONDecoder().decode([DisasterMapMarker].self, from: data)) ?? []
    }

    static func saveMarkers(_ markers: [DisasterMapMarker]) throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(markers)
        try data.write(to: markersURL, options: .atomic)
    }

    private static var markersURL: URL { storageDirectory.appending(path: markersFileName) }

    private static var storageDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "MeteoScope", directoryHint: .isDirectory)
    }
}

#Preview("防災マップ・未登録") {
    DisasterMapView()
}

#Preview("目印エディター") {
    DisasterMarkerEditor(
        marker: DisasterMapMarker(
            id: UUID(),
            pageIndex: 0,
            x: 0.5,
            y: 0.5,
            title: "奈良市立中央小学校",
            note: "家族の集合場所",
            symbol: .shelter,
            createdAt: .now
        ),
        onSave: { _ in }
    )
}

#Preview("画像上の目印") {
    EditableDisasterMapImage(
        image: UIImage(systemName: "map.fill")!,
        markers: [
            DisasterMapMarker(
                id: UUID(),
                pageIndex: 0,
                x: 0.5,
                y: 0.5,
                title: "避難場所",
                note: "",
                symbol: .shelter,
                createdAt: .now
            )
        ],
        isAddingMarker: true,
        onAddMarker: { _, _ in }
    )
}
