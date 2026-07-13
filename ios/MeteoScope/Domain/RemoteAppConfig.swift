import Foundation

struct RemoteAppConfig: Decodable, Sendable {
    let maintenance: MaintenanceConfiguration?
    let notices: [RemoteNotice]

    init(maintenance: MaintenanceConfiguration? = nil, notices: [RemoteNotice] = []) {
        self.maintenance = maintenance
        self.notices = notices
    }

    enum CodingKeys: CodingKey {
        case maintenance
        case notices
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        maintenance = try container.decodeIfPresent(MaintenanceConfiguration.self, forKey: .maintenance)
        notices = try container.decodeIfPresent([RemoteNotice].self, forKey: .notices) ?? []
    }
}
struct MaintenanceConfiguration: Decodable, Sendable {
    let enabled: Bool
    let message: String?
}

struct RemoteNotice: Decodable, Identifiable, Sendable {
    let serverID: String?
    let title: String?
    let body: String?
    let level: Level
    let enabled: Bool
    let isTicker: Bool

    var id: String {
        serverID ?? [title, body].compactMap { $0 }.joined(separator: "-")
    }

    enum Level: String, Decodable, Sendable {
        case info
        case warning
        case critical

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            self = Level(rawValue: (try? container.decode(String.self)) ?? "") ?? .info
        }
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "id"
        case title
        case body
        case level
        case enabled
        case isTicker
    }

    init(
        serverID: String? = nil,
        title: String? = nil,
        body: String? = nil,
        level: Level = .info,
        enabled: Bool = true,
        isTicker: Bool = false
    ) {
        self.serverID = serverID
        self.title = title
        self.body = body
        self.level = level
        self.enabled = enabled
        self.isTicker = isTicker
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        serverID = try container.decodeIfPresent(String.self, forKey: .serverID)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        body = try container.decodeIfPresent(String.self, forKey: .body)
        level = try container.decodeIfPresent(Level.self, forKey: .level) ?? .info
        enabled = try container.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        isTicker = try container.decodeIfPresent(Bool.self, forKey: .isTicker) ?? false
    }
}
