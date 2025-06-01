import { injectable } from "tsyringe";
import { DriverService } from "./driver.service";

@injectable()
export class DriverController {
  constructor(private readonly driverService: DriverService) {}
}
