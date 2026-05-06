import ExpoModulesCore
import HealthKit

private func iso8601String(from date: Date) -> String {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f.string(from: date)
}

/// Matches react-native-health `stringForHKWorkoutActivityType` naming for common types; `@unknown default` covers the rest.
private func activityName(for type: HKWorkoutActivityType) -> String {
  switch type {
  case .americanFootball: return "AmericanFootball"
  case .archery: return "Archery"
  case .australianFootball: return "AustralianFootball"
  case .badminton: return "Badminton"
  case .baseball: return "Baseball"
  case .basketball: return "Basketball"
  case .bowling: return "Bowling"
  case .boxing: return "Boxing"
  case .cardioDance: return "CardioDance"
  case .climbing: return "Climbing"
  case .cooldown: return "Cooldown"
  case .cricket: return "Cricket"
  case .crossTraining: return "CrossTraining"
  case .curling: return "Curling"
  case .cycling: return "Cycling"
  case .dance: return "Dance"
  case .danceInspiredTraining: return "DanceInspiredTraining"
  case .discSports: return "DiscSports"
  case .elliptical: return "Elliptical"
  case .equestrianSports: return "EquestrianSports"
  case .fencing: return "Fencing"
  case .fitnessGaming: return "FitnessGaming"
  case .fishing: return "Fishing"
  case .functionalStrengthTraining: return "FunctionalStrengthTraining"
  case .golf: return "Golf"
  case .gymnastics: return "Gymnastics"
  case .handball: return "Handball"
  case .hiking: return "Hiking"
  case .hockey: return "Hockey"
  case .hunting: return "Hunting"
  case .lacrosse: return "Lacrosse"
  case .martialArts: return "MartialArts"
  case .mindAndBody: return "MindAndBody"
  case .mixedMetabolicCardioTraining: return "MixedMetabolicCardioTraining"
  case .paddleSports: return "PaddleSports"
  case .play: return "Play"
  case .preparationAndRecovery: return "PreparationAndRecovery"
  case .racquetball: return "Racquetball"
  case .rowing: return "Rowing"
  case .rugby: return "Rugby"
  case .running: return "Running"
  case .sailing: return "Sailing"
  case .skatingSports: return "SkatingSports"
  case .snowSports: return "SnowSports"
  case .soccer: return "Soccer"
  case .socialDance: return "SocialDance"
  case .softball: return "Softball"
  case .squash: return "Squash"
  case .stairClimbing: return "StairClimbing"
  case .surfingSports: return "SurfingSports"
  case .swimming: return "Swimming"
  case .tableTennis: return "TableTennis"
  case .tennis: return "Tennis"
  case .trackAndField: return "TrackAndField"
  case .traditionalStrengthTraining: return "TraditionalStrengthTraining"
  case .volleyball: return "Volleyball"
  case .walking: return "Walking"
  case .waterFitness: return "WaterFitness"
  case .waterPolo: return "WaterPolo"
  case .waterSports: return "WaterSports"
  case .wheelchairRunPace: return "WheelchairRunPace"
  case .wheelchairWalkPace: return "WheelchairWalkPace"
  case .wrestling: return "Wrestling"
  case .yoga: return "Yoga"
  case .barre: return "Barre"
  case .coreTraining: return "CoreTraining"
  case .crossCountrySkiing: return "CrossCountrySkiing"
  case .downhillSkiing: return "DownhillSkiing"
  case .flexibility: return "Flexibility"
  case .highIntensityIntervalTraining: return "HighIntensityIntervalTraining"
  case .jumpRope: return "JumpRope"
  case .kickboxing: return "Kickboxing"
  case .pilates: return "Pilates"
  case .snowboarding: return "Snowboarding"
  case .stepTraining: return "StepTraining"
  case .other: return "Other"
  @unknown default:
    return "Other"
  }
}

private func deviceString(for workout: HKWorkout) -> String {
  if #available(iOS 11.0, *) {
    if let t = workout.sourceRevision.productType, !t.isEmpty {
      return t
    }
  }
  return workout.device?.name ?? "iPhone"
}

private func jsonSafeMetadata(_ metadata: [String: Any]?) -> Any {
  guard let metadata = metadata, !metadata.isEmpty else {
    return [String: Any]()
  }
  var out: [String: Any] = [:]
  for (key, value) in metadata {
    switch value {
    case let s as String:
      out[key] = s
    case let n as NSNumber:
      out[key] = n.doubleValue
    case let b as Bool:
      out[key] = b
    case let d as Date:
      out[key] = iso8601String(from: d)
    default:
      out[key] = String(describing: value)
    }
  }
  return out
}

private func serializeWorkout(_ workout: HKWorkout) -> [String: Any] {
  let energy = workout.totalEnergyBurned?.doubleValue(for: HKUnit.kilocalorie()) ?? 0
  let distance = workout.totalDistance?.doubleValue(for: HKUnit.mile()) ?? 0
  let wasUserEntered = (workout.metadata?[HKMetadataKeyWasUserEntered] as? NSNumber)?.intValue == 1
  let tracked = !wasUserEntered

  var events: [[String: Any]] = []
  if let workoutEvents = workout.workoutEvents {
    for ev in workoutEvents {
      events.append([
        "startDate": iso8601String(from: ev.dateInterval.start),
        "endDate": iso8601String(from: ev.dateInterval.end),
        "eventTypeInt": ev.type.rawValue
      ])
    }
  }

  let activityType = workout.workoutActivityType
  return [
    "activityId": activityType.rawValue,
    "activityName": activityName(for: activityType),
    "calories": energy,
    "device": deviceString(for: workout),
    "id": workout.uuid.uuidString,
    "tracked": tracked,
    "metadata": jsonSafeMetadata(workout.metadata),
    "sourceName": workout.sourceRevision.source.name,
    "sourceId": workout.sourceRevision.source.bundleIdentifier,
    "distance": distance,
    "start": iso8601String(from: workout.startDate),
    "end": iso8601String(from: workout.endDate),
    "duration": workout.duration,
    "workoutEvents": events
  ]
}

public final class NomlogHealthModule: Module {
  private let store = HKHealthStore()
  private var workoutObserverQuery: HKObserverQuery?

  public func definition() -> ModuleDefinition {
    Name("NomlogHealth")

    Events("onWorkoutsUpdated")

    Function("isHealthDataAvailable") { () -> Bool in
      HKHealthStore.isHealthDataAvailable()
    }

    AsyncFunction("requestActivityAuthorizationAsync") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.reject("E_HEALTHKIT_UNAVAILABLE", "Health data is not available on this device")
        return
      }

      var types = Set<HKObjectType>()
      types.insert(HKObjectType.workoutType())
      if let steps = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(steps) }
      if let activeEnergy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(activeEnergy) }
      if let dist = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { types.insert(dist) }

      self.store.requestAuthorization(toShare: nil, read: types) { ok, error in
        if let error = error {
          promise.reject("E_HEALTHKIT_AUTH", error.localizedDescription)
          return
        }
        promise.resolve(ok)
      }
    }

    AsyncFunction("getWorkoutsInRangeAsync") { (startMs: Double, endMs: Double, promise: Promise) in
      let start = Date(timeIntervalSince1970: startMs / 1000.0)
      let end = Date(timeIntervalSince1970: endMs / 1000.0)
      // Default (empty) options: samples whose interval *intersects* [start, end]. strictStartDate would drop any workout
      // whose start is before `start` even if it ended recently (and matches user expectations for “last 72h” poorly).
      let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])

      let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
      let query = HKSampleQuery(
        sampleType: HKObjectType.workoutType(),
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error = error {
          promise.reject("E_HEALTHKIT_QUERY", error.localizedDescription)
          return
        }
        let workouts = (samples as? [HKWorkout] ?? []).map { serializeWorkout($0) }
        promise.resolve(workouts)
      }

      self.store.execute(query)
    }

    AsyncFunction("startWorkoutObserverAsync") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.reject("E_HEALTHKIT_UNAVAILABLE", "Health data is not available on this device")
        return
      }

      let workoutType = HKObjectType.workoutType()

      if let existing = self.workoutObserverQuery {
        self.store.stop(existing)
        self.workoutObserverQuery = nil
      }

      self.store.enableBackgroundDelivery(for: workoutType, frequency: .immediate) { _, _ in
        let query = HKObserverQuery(sampleType: workoutType, predicate: nil) { [weak self] _, completionHandler, error in
          if error != nil {
            completionHandler()
            return
          }
          DispatchQueue.main.async {
            self?.sendEvent("onWorkoutsUpdated", ["reason": "update"])
            completionHandler()
          }
        }
        self.workoutObserverQuery = query
        self.store.execute(query)
        promise.resolve(true)
      }
    }

    AsyncFunction("stopWorkoutObserverAsync") { (promise: Promise) in
      if let q = self.workoutObserverQuery {
        self.store.stop(q)
        self.workoutObserverQuery = nil
      }
      let workoutType = HKObjectType.workoutType()
      self.store.disableBackgroundDelivery(for: workoutType) { _, _ in
        promise.resolve(true)
      }
    }
  }
}
