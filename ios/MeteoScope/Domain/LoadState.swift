enum LoadState<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(String)
}

extension LoadState {
    var isIdle: Bool {
        if case .idle = self { return true }
        return false
    }
}
