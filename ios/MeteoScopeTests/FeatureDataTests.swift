import XCTest
@testable import MeteoScope

final class FeatureDataTests: XCTestCase {
    func testActiveFaultInfoFormatsJshisAttributes() throws {
        let info = try XCTUnwrap(ActiveFaultInfo(attributes: [
            "FLT_ID": "F001",
            "LTENAME": "中央構造線断層帯（全体が同時に活動）",
            "MAG": "-7.9",
            "MAX_T30P": "0.005"
        ]))

        XCTAssertEqual(info.id, "F001")
        XCTAssertEqual(info.magnitude, "Mw 7.9")
        XCTAssertEqual(info.thirtyYearProbability, "0.5%")
        XCTAssertTrue(info.breakableName.contains("\u{200B}（"))
    }

    func testActiveFaultInfoRejectsMissingNameAndHandlesUnknownValues() throws {
        XCTAssertNil(ActiveFaultInfo(attributes: ["MAG": "7.0"]))
        let info = try XCTUnwrap(ActiveFaultInfo(attributes: [
            "LTENAME": "テスト断層帯",
            "MAG": "-999.0",
            "MAX_T30P": "0"
        ]))
        XCTAssertEqual(info.magnitude, "--")
        XCTAssertEqual(info.thirtyYearProbability, "0%")
    }

    func testAmedasBuildsHumidityAndPressureRankings() throws {
        let metadataData = """
        {
          "001": {"kjName":"高湿度","lat":[35,0],"lon":[135,0]},
          "002": {"kjName":"低湿度","lat":[34,30],"lon":[136,0]}
        }
        """.data(using: .utf8)!
        let observationData = """
        {
          "001": {"humidity":[88,0],"normalPressure":[1002.4,0]},
          "002": {"humidity":[35,0],"normalPressure":[1011.8,0]}
        }
        """.data(using: .utf8)!
        let metadata = try JSONDecoder().decode([String: AmedasStationRecord].self, from: metadataData)
        let observations = try JSONDecoder().decode([String: AmedasObservationRecord].self, from: observationData)
        let stations = AmedasSnapshotBuilder.buildStations(observations: observations, metadata: metadata)
        let snapshot = AmedasSnapshot(updatedAt: "12:00", stations: stations, dailyPressureMinimum: [])

        XCTAssertEqual(
            snapshot.ranking(metric: .humidity, period: .current, order: .low).first?.name,
            "低湿度"
        )
        XCTAssertEqual(
            snapshot.ranking(metric: .pressure, period: .current, order: .high).first?.value,
            1011.8
        )
    }

    func testAmedasRejectsNonNormalQualityValues() throws {
        let data = """
        {"temp":[30.5,1],"humidity":[55,0]}
        """.data(using: .utf8)!
        let observation = try JSONDecoder().decode(AmedasObservationRecord.self, from: data)

        XCTAssertNil(observation.values.temperature)
        XCTAssertEqual(observation.values.humidity, 55)
    }

    func testAmedasTimestampUsesJapanTime() {
        XCTAssertEqual(
            AmedasSnapshotBuilder.mapTimestamp(from: "2026-07-13T17:50:00+09:00"),
            "20260713175000"
        )
    }

    func testDailyPressureHTMLCanBeSortedBothWays() {
        let stations = AmedasSnapshot.preview.stations
        let html = """
        <table>
          <tr class="o1"><td>奈良</td><td></td><td></td><td>998.2</td><td>15:30</td></tr>
          <tr class="o2"><td>東京</td><td></td><td></td><td>1001.4</td><td>14:10</td></tr>
        </table>
        """
        let daily = AmedasSnapshotBuilder.parseDailyPressureMinimum(html: html, stations: stations)
        let snapshot = AmedasSnapshot(updatedAt: "12:00", stations: stations, dailyPressureMinimum: daily)

        XCTAssertEqual(snapshot.ranking(metric: .pressure, period: .today, order: .low).first?.name, "奈良")
        XCTAssertEqual(snapshot.ranking(metric: .pressure, period: .today, order: .high).first?.name, "東京")
    }

    func testAmedasDailySeriesMergesChunksAndRejectsBadQuality() throws {
        let first = try JSONDecoder().decode([String: AmedasObservationRecord].self, from: """
        {
          "20260713000000":{"temp":[27.2,0]},
          "20260713001000":{"temp":[27.3,1]}
        }
        """.data(using: .utf8)!)
        let second = try JSONDecoder().decode([String: AmedasObservationRecord].self, from: """
        {"20260713030000":{"temp":[28.1,0]}}
        """.data(using: .utf8)!)

        let series = AmedasSeriesBuilder.build(
            stationID: "62078",
            referenceTime: "2026-07-13T19:00:00+09:00",
            metric: .temperature,
            chunks: [first, second]
        )

        XCTAssertEqual(series.points.map(\.value), [27.2, 28.1])
        XCTAssertEqual(series.minimum, 27.2)
        XCTAssertEqual(series.maximum, 28.1)
        XCTAssertEqual(AmedasSeriesBuilder.chunkURLs(
            stationID: "62078",
            referenceTime: "2026-07-13T07:00:00+09:00"
        ).count, 3)
    }

    func testWarningBuilderRemovesReleasedWarnings() throws {
        let data = """
        [
          {
            "reportDatetime":"2026-07-13T10:00:00+09:00",
            "warning":{"class20Items":[{"areaCode":"2920100","kinds":[{"code":"03","status":"発表"},{"code":"14","status":"発表"}]}]}
          },
          {
            "reportDatetime":"2026-07-13T11:00:00+09:00",
            "warning":{"class20Items":[{"areaCode":"2920100","kinds":[{"code":"03","status":"解除"}]}]}
          }
        ]
        """.data(using: .utf8)!
        let reports = try JSONDecoder().decode([WarningReport].self, from: data)
        let snapshot = WarningSnapshotBuilder.build(from: reports)

        XCTAssertEqual(snapshot.activeAreas.count, 1)
        XCTAssertEqual(snapshot.activeAreas.first?.warnings.map(\.code), ["14"])
        XCTAssertEqual(snapshot.prefectures.first?.name, "奈良県")
    }

    func testTyphoonBuilderUsesCurrentSpecification() throws {
        let targetData = """
        [{"tropicalCyclone":"TC2612","typhoonNumber":"2611","category":"TS","issue":"2026-07-13T19:10:00+09:00"}]
        """.data(using: .utf8)!
        let specificationData = """
        [
          {"part":"title","issue":{"JST":"2026-07-13T19:10:00+09:00"},"typhoonNumber":"11","name":{"jp":"ハイシェン"}},
          {"advancedHours":0,"category":{"jp":"台風"},"location":"フィリピンの東","course":"北西","pressure":"1002","maximumWind":{"sustained":{"m/s":"18"},"gust":{"m/s":"25"}},"position":{"deg":[11.8,136.3]}}
        ]
        """.data(using: .utf8)!
        let targets = try JSONDecoder().decode([TyphoonTargetRecord].self, from: targetData)
        let specifications = try JSONDecoder().decode([TyphoonSpecificationRecord].self, from: specificationData)
        let forecastData = """
        [
          {"advancedHours":0,"center":[11.8,136.3],"galeWarningArea":{"center":[11.8,136.3],"radius":444480},"stormWarningArea":{"arc":[[[11.8,136.3],185200,[0,360]]]}},
          {"advancedHours":24,"validtime":{"JST":"2026-07-14T18:00:00+09:00"},"center":[13.9,134.9],"probabilityCircle":{"radius":105564}}
        ]
        """.data(using: .utf8)!
        let forecasts = try JSONDecoder().decode([TyphoonForecastRecord].self, from: forecastData)
        let snapshot = TyphoonSnapshotBuilder.build(
            targets: targets,
            forecasts: ["TC2612": forecasts],
            specifications: ["TC2612": specifications]
        )

        XCTAssertEqual(snapshot.typhoons.first?.name, "ハイシェン")
        XCTAssertEqual(snapshot.typhoons.first?.pressure, "1002 hPa")
        XCTAssertEqual(snapshot.typhoons.first?.maximumGust, "25 m/s")
        XCTAssertEqual(snapshot.typhoons.first?.strongWindArea?.radiusMeters, 444_480)
        XCTAssertEqual(snapshot.typhoons.first?.stormArea?.radiusMeters, 185_200)
        XCTAssertEqual(snapshot.typhoons.first?.forecastPoints.last?.probabilityCircleRadiusMeters, 105_564)
    }

    func testTyphoonBuilderShowsExtratropicalTransitionAndMissingValuesAsHyphen() throws {
        let targets = try JSONDecoder().decode([TyphoonTargetRecord].self, from: """
        [{"tropicalCyclone":"TC2609","typhoonNumber":"2609","category":"TS"}]
        """.data(using: .utf8)!)
        let specifications = try JSONDecoder().decode([TyphoonSpecificationRecord].self, from: """
        [
          {"part":"title","typhoonNumber":"9","name":{"jp":"バービー"}},
          {"advancedHours":0,"category":{"jp":"温帯低気圧"},"position":{"deg":[35.0,140.0]}}
        ]
        """.data(using: .utf8)!)

        let snapshot = TyphoonSnapshotBuilder.build(
            targets: targets,
            forecasts: [:],
            specifications: ["TC2609": specifications]
        )
        let typhoon = try XCTUnwrap(snapshot.typhoons.first)

        XCTAssertEqual(typhoon.transitionStatus, "台風9号は温帯低気圧に変わりました")
        XCTAssertEqual(typhoon.location, "-")
        XCTAssertEqual(typhoon.pressure, "-")
        XCTAssertEqual(typhoon.maximumWind, "-")
        XCTAssertEqual(typhoon.maximumGust, "-")
        XCTAssertEqual(typhoon.course, "-")
        XCTAssertEqual(typhoon.speed, "-")
        XCTAssertEqual(typhoon.movement, "-")
    }

    func testEarthquakeFeedAndDetailDecode() throws {
        let feed = """
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>feed-1</id><title>震源・震度情報</title><updated>2026-07-13T10:00:00Z</updated>
            <link href="https://example.com/VXSE53.xml" />
          </entry>
        </feed>
        """.data(using: .utf8)!
        let entries = try EarthquakeXMLDecoder.feedEntries(data: feed)
        let report = """
        <Report>
          <Control><DateTime>2026-07-13T10:01:00Z</DateTime></Control>
          <Head><ReportDateTime>2026-07-13T19:01:00+09:00</ReportDateTime><EventID>event-1</EventID><Headline><Text>津波の心配はありません。</Text></Headline></Head>
          <Body><Earthquake><OriginTime>2026-07-13T18:58:00+09:00</OriginTime><Hypocenter><Area><Name>奈良県</Name><Coordinate>+34.6+135.8-10000/</Coordinate></Area></Hypocenter><Magnitude>3.2</Magnitude></Earthquake><Intensity><Observation><MaxInt>2</MaxInt><Pref><Name>奈良県</Name><Area><Name>奈良県</Name><Code>560</Code><MaxInt>2</MaxInt><City><IntensityStation><Name>奈良市＊</Name><Code>2920100</Code><Int>2</Int></IntensityStation><IntensityStation><Name>座標未登録地点</Name><Code>unknown</Code><Int>1</Int></IntensityStation></City></Area></Pref></Observation></Intensity><Comments><ForecastComment><Text>この地震による津波の心配はありません。</Text><Code>0215</Code></ForecastComment></Comments></Body>
        </Report>
        """.data(using: .utf8)!

        let earthquake = try EarthquakeXMLDecoder.earthquake(
            data: report,
            entry: try XCTUnwrap(entries.first),
            stations: [
                EarthquakeStationLookup.normalizedName("奈良市"): EarthquakeStationRecord(
                    name: "奈良市",
                    latitude: 34.68,
                    longitude: 135.82
                )
            ]
        )

        XCTAssertEqual(earthquake.hypocenterName, "奈良県")
        XCTAssertEqual(earthquake.eventID, "event-1")
        XCTAssertEqual(earthquake.tsunamiComment, "この地震による津波の心配はありません。")
        XCTAssertEqual(earthquake.magnitude, "M3.2")
        XCTAssertEqual(earthquake.depth, "10 km")
        XCTAssertEqual(earthquake.maximumIntensity, "震度2")
        XCTAssertEqual(earthquake.intensityAreas.first?.areaCode, "560")
        XCTAssertEqual(earthquake.intensityPoints.first?.name, "奈良市＊")
        XCTAssertEqual(earthquake.intensityPoints.first?.prefecture, "奈良県")
        XCTAssertEqual(earthquake.intensityPoints.first?.coordinate?.latitude, 34.68)
        XCTAssertEqual(earthquake.intensityPoints.count, 2)
        XCTAssertNil(earthquake.intensityPoints.last?.coordinate)
        XCTAssertEqual(EarthquakeStationLookup.normalizedName("八戸市南郷＊"), "八戸市南郷")
        let renamedStationLookup = EarthquakeStationLookup.makeLookup([
            EarthquakeStationRecord(name: "蓬田村蓬田", latitude: 40.97, longitude: 140.66)
        ])
        XCTAssertEqual(
            EarthquakeStationLookup.station(
                code: "0230400",
                name: "蓬田村阿弥陀川＊",
                in: renamedStationLookup
            )?.latitude,
            40.97
        )
        let ambiguousLookup = EarthquakeStationLookup.makeLookup([
            EarthquakeStationRecord(name: "八戸市南郷", latitude: 40.4, longitude: 141.43),
            EarthquakeStationRecord(name: "八戸市湊町", latitude: 40.52, longitude: 141.52)
        ])
        XCTAssertNil(
            EarthquakeStationLookup.station(
                code: "unknown",
                name: "八戸市未登録＊",
                in: ambiguousLookup
            )
        )
    }

    func testTsunamiDecodeMergeAndMapLayer() throws {
        let feed = """
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry><id>tsunami-1</id><title>津波警報・注意報・予報</title><updated>2026-07-15T10:05:00+09:00</updated><link href="https://example.com/VTSE41.xml" /></entry>
        </feed>
        """.data(using: .utf8)!
        let entry = try XCTUnwrap(EarthquakeXMLDecoder.feedEntries(data: feed).first)
        let report = """
        <Report>
          <Control><DateTime>2026-07-15T10:05:00+09:00</DateTime></Control>
          <Head><Title>津波警報・注意報・予報</Title><ReportDateTime>2026-07-15T10:05:00+09:00</ReportDateTime><EventID>event-tsunami</EventID><Headline><Text>海の中や海岸付近は危険です。</Text></Headline></Head>
          <Body><Tsunami><Forecast><Item><Area><Name>北海道太平洋沿岸東部</Name><Code>100</Code></Area><Category><Kind><Name>津波注意報</Name><Code>62</Code></Kind></Category><FirstHeight><ArrivalTime>2026-07-15T10:30:00+09:00</ArrivalTime></FirstHeight><MaxHeight><TsunamiHeight description="１ｍ">1.0</TsunamiHeight></MaxHeight></Item></Forecast></Tsunami></Body>
        </Report>
        """.data(using: .utf8)!

        let decoded = try EarthquakeXMLDecoder.tsunami(data: report, entry: entry)
        let tsunami = try XCTUnwrap(EarthquakeXMLDecoder.mergedTsunami(reports: [decoded]))

        XCTAssertEqual(tsunami.eventID, "event-tsunami")
        XCTAssertEqual(tsunami.highestLevel, .advisory)
        XCTAssertEqual(tsunami.areas.first?.height, "１ｍ")
        XCTAssertTrue(tsunami.isActive)

        let overlay = WeatherMapOverlayBuilder.earthquake(nil, tsunami: tsunami)
        XCTAssertEqual(overlay.geoJSONSources.first?.layers.first?.values, ["100"])
        XCTAssertEqual(overlay.geoJSONSources.first?.layers.first?.geometry, .line)
    }

    func testDMDataEarthquakeHistoryAndLatestStationDecode() throws {
        let historyData = """
        {
          "enabled":true,
          "items":[{
            "event_id":"20260715212943",
            "telegram_type":"VXSE53",
            "place":"岩手県沖",
            "origin_time":"2026-07-15T21:29:00+09:00",
            "magnitude":"4.4",
            "depth":"40",
            "max_intensity":"1",
            "tsunami_status":"心配なし",
            "latitude":40.1,
            "longitude":142.5,
            "regions":[{"code":"210","name":"岩手県沿岸北部","maxInt":"1"}],
            "updated_at":"2026-07-15T12:33:00.000Z"
          }]
        }
        """.data(using: .utf8)!
        let latestData = """
        {
          "latest":{"earthquake":{"data":{
            "eventId":"20260715212943",
            "points":[{
              "code":"0320224",
              "name":"宮古市田老＊",
              "intensity":"1",
              "latitude":39.7356,
              "longitude":141.9669
            }]
          },"receivedAt":"2026-07-15T12:33:00.000Z"}}
        }
        """.data(using: .utf8)!

        let history = try JSONDecoder().decode(DMDataEarthquakeHistoryResponse.self, from: historyData)
        let latest = try JSONDecoder().decode(DMDataLatestResponse.self, from: latestData)
        let earthquake = try XCTUnwrap(DMDataEarthquakeBuilder.build(
            history: history.items,
            latest: latest.latest.earthquake
        ).first)

        XCTAssertEqual(earthquake.eventID, "20260715212943")
        XCTAssertEqual(earthquake.hypocenterName, "岩手県沖")
        XCTAssertEqual(earthquake.magnitude, "M4.4")
        XCTAssertEqual(earthquake.depth, "40 km")
        XCTAssertEqual(earthquake.maximumIntensity, "震度1")
        XCTAssertEqual(earthquake.intensityAreas.first?.areaCode, "210")
        XCTAssertEqual(earthquake.intensityPoints.first?.prefecture, "岩手県")
        XCTAssertEqual(earthquake.intensityPoints.first?.coordinate?.longitude, 141.9669)
        XCTAssertEqual(earthquake.tsunamiComment, "この地震による津波の心配はありません。")
    }

    func testEarlyWarningBuilderKeepsMiddleAndHighProbabilities() throws {
        let data = """
        [[{"reportDatetime":"2026-07-13T17:00:00+09:00","timeSeries":[{"timeDefines":["2026-07-14T00:00:00+09:00","2026-07-15T00:00:00+09:00"],"areas":[{"code":"290000","properties":[{"type":"雨の警報級の可能性","probabilities":["中","高"]}]}]}]}]]
        """.data(using: .utf8)!
        let reports = try EarlyWarningSnapshotBuilder.decodeReports(from: data)
        let catalog = JMAAreaCatalog(
            offices: ["290000": JMAAreaRecord(name: "奈良県")],
            class10s: [:],
            class20s: [:]
        )
        let snapshot = EarlyWarningSnapshotBuilder.build(reports: reports, areaCatalog: catalog)

        XCTAssertEqual(snapshot.areas.first?.areaName, "奈良県")
        XCTAssertEqual(snapshot.areas.first?.highestLevel, .high)
        XCTAssertEqual(snapshot.areas.first?.items.count, 2)
    }

    func testRiverFloodDecoderFiltersFeedAndDetectsLevel() throws {
        let feed = """
        <feed><entry><id>river-1</id><title>河川</title><updated>2026-07-13T10:00:00Z</updated><link href="https://example.com/20260713_VXKO50_test.xml" /></entry></feed>
        """.data(using: .utf8)!
        let entry = try XCTUnwrap(RiverFloodXMLDecoder.feedEntries(data: feed).first)
        let report = """
        <Report><Control><DateTime>2026-07-13T10:00:00Z</DateTime></Control><Head><Title>大和川氾濫危険情報</Title><ReportDateTime>2026-07-13T19:00:00+09:00</ReportDateTime><EventID>river-event</EventID><Headline><Text>氾濫危険水位に到達しました。</Text><Information type="予報区域"><Item><Areas><Area><Name>大和川上流</Name><Code>860604000001</Code></Area></Areas></Item></Information><Information type="河川"><Item><Areas><Area><Name>大和川</Name></Area></Areas></Item></Information></Headline></Head></Report>
        """.data(using: .utf8)!
        let summary = try RiverFloodXMLDecoder.report(data: report, entry: entry)

        XCTAssertEqual(summary.level, 4)
        XCTAssertEqual(summary.forecastAreaCode, "860604000001")
        XCTAssertEqual(summary.forecastAreaName, "大和川上流")
        XCTAssertEqual(summary.riverNames, ["大和川"])
    }

    func testWeatherMapOverlayIncludesTyphoonTrack() {
        let overlay = WeatherMapOverlayBuilder.typhoon(TyphoonSnapshot.preview.typhoons[0])
        XCTAssertEqual(overlay.points.count, 2)
        XCTAssertEqual(overlay.polylines.count, 1)
        XCTAssertEqual(overlay.polygons.count, 2)
    }

    func testWeatherMapOverlayBuildsWarningAndEarthquakeRegionLayers() {
        let warnings = WeatherMapOverlayBuilder.warnings(.preview)
        let earthquake = WeatherMapOverlayBuilder.earthquake(
            EarthquakeSnapshot.preview.earthquakes[0],
            tsunami: EarthquakeSnapshot.preview.tsunami
        )

        XCTAssertFalse(warnings.geoJSONSources.first?.layers.isEmpty ?? true)
        XCTAssertEqual(earthquake.geoJSONSources.first?.layers.first?.values, ["560"])
        XCTAssertEqual(earthquake.geoJSONSources.count, 2)
    }
}
