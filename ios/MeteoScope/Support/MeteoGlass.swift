import SwiftUI

/// A single compatibility layer for custom Liquid Glass surfaces.
///
/// Xcode 16 does not know the iOS 26 glass symbols, so the compile-time guard is
/// required in addition to the runtime availability check. Keeping that detail
/// here prevents every feature view from repeating fragile availability code.
extension View {
    func meteoGlassSurface(
        cornerRadius: CGFloat = 18,
        interactive: Bool = false,
        tint: Color? = nil
    ) -> some View {
        modifier(
            MeteoGlassSurfaceModifier(
                cornerRadius: cornerRadius,
                interactive: interactive,
                tint: tint
            )
        )
    }

    func meteoGlassButton(prominent: Bool = false) -> some View {
        modifier(MeteoGlassButtonModifier(prominent: prominent))
    }
}

struct MeteoGlassGroup<Content: View>: View {
    private let spacing: CGFloat
    private let content: Content

    init(spacing: CGFloat = 12, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    @ViewBuilder
    var body: some View {
#if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) {
                content
            }
        } else {
            content
        }
#else
        content
#endif
    }
}

private struct MeteoGlassSurfaceModifier: ViewModifier {
    let cornerRadius: CGFloat
    let interactive: Bool
    let tint: Color?

    @ViewBuilder
    func body(content: Content) -> some View {
#if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            if interactive {
                content.glassEffect(
                    .regular.tint(tint).interactive(),
                    in: .rect(cornerRadius: cornerRadius)
                )
            } else {
                content.glassEffect(
                    .regular.tint(tint),
                    in: .rect(cornerRadius: cornerRadius)
                )
            }
        } else {
            fallback(content: content)
        }
#else
        fallback(content: content)
#endif
    }

    private func fallback(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        if let tint {
                            RoundedRectangle(cornerRadius: cornerRadius)
                                .fill(tint.opacity(interactive ? 0.82 : 0.22))
                        }
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(.white.opacity(0.16), lineWidth: 0.5)
            }
    }
}

private struct MeteoGlassButtonModifier: ViewModifier {
    let prominent: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
#if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            if prominent {
                content.buttonStyle(.glassProminent)
            } else {
                content.buttonStyle(.glass)
            }
        } else {
            fallback(content: content)
        }
#else
        fallback(content: content)
#endif
    }

    @ViewBuilder
    private func fallback(content: Content) -> some View {
        if prominent {
            content.buttonStyle(.borderedProminent)
        } else {
            content.buttonStyle(.bordered)
        }
    }
}
