import { injectable } from "tsyringe";
import { WorkerService } from "./worker.service";

@injectable()
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}
}
